const express = require("express");

const router = express.Router();

const parseIdArray = (value) =>
  Array.isArray(value) && value.length > 0 && value.every((id) => typeof id === "number" && Number.isInteger(id) && id > 0);

const OrderWriteSchema = {
  parse(body) {
    if (
      typeof body?.userId !== "number" ||
      !Number.isInteger(body.userId) ||
      body.userId <= 0 ||
      !parseIdArray(body.productIds) ||
      (body.payment !== undefined && typeof body.payment !== "boolean")
    ) {
      throw new Error("Invalid order body");
    }

    return body;
  },
};

const OrderPatchSchema = {
  parse(body) {
    const hasUserId = body?.userId !== undefined;
    const hasProductIds = body?.productIds !== undefined;
    const hasPayment = body?.payment !== undefined;

    if (!hasUserId && !hasProductIds && !hasPayment) {
      throw new Error("At least one field is required");
    }

    if (hasUserId && (typeof body.userId !== "number" || !Number.isInteger(body.userId) || body.userId <= 0)) {
      throw new Error("Invalid userId");
    }

    if (hasProductIds && !parseIdArray(body.productIds)) {
      throw new Error("Invalid productIds");
    }

    if (hasPayment && typeof body.payment !== "boolean") {
      throw new Error("Invalid payment");
    }

    return body;
  },
};

const normalizePayment = (payment) => (payment === undefined ? false : payment);
const getSql = (req) => req.app.locals.sql;
const getOrderValue = (order, camelKey, lowerKey) => order[camelKey] ?? order[lowerKey];

const getUser = async (sql, userId) => {
  const users = await sql`
    SELECT id, username, email
    FROM users
    WHERE id = ${userId}
  `;

  return users[0] ?? null;
};

const getProducts = async (sql, productIds) => {
  if (productIds.length === 0) {
    return [];
  }

  const products = await Promise.all(
    productIds.map(async (productId) => {
      const result = await sql`
        SELECT *
        FROM products
        WHERE id = ${productId}
      `;

      return result[0] ?? null;
    })
  );

  return products.filter(Boolean);
};

const computeTotal = (products) => {
  const subtotal = products.reduce((sum, product) => sum + Number(product.price), 0);
  return Number((subtotal * 1.2).toFixed(2));
};

const hydrateOrder = async (sql, order) => {
  const userId = getOrderValue(order, "userId", "userid");
  const productIds = getOrderValue(order, "productIds", "productids") ?? [];
  const user = await getUser(sql, userId);
  const products = await getProducts(sql, productIds);

  return {
    id: order.id,
    userId,
    productIds,
    total: order.total,
    payment: order.payment,
    createdAt: getOrderValue(order, "createdAt", "createdat"),
    updatedAt: getOrderValue(order, "updatedAt", "updatedat"),
    user,
    products,
  };
};

const ensureReferencesExist = async (sql, userId, productIds) => {
  const user = await getUser(sql, userId);

  if (!user) {
    return { ok: false, message: "User not found" };
  }

  const products = await getProducts(sql, productIds);

  if (products.length !== productIds.length) {
    return { ok: false, message: "Product not found" };
  }

  return { ok: true, user, products };
};

router.get("/", async (req, res) => {
  try {
    const sql = getSql(req);
    const orders = await sql`
      SELECT *
      FROM orders
      ORDER BY id ASC
    `;

    const hydratedOrders = await Promise.all(orders.map((order) => hydrateOrder(sql, order)));
    res.send(hydratedOrders);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const sql = getSql(req);
    const orders = await sql`
      SELECT *
      FROM orders
      WHERE id = ${req.params.id}
    `;

    if (orders.length === 0) {
      return res.status(404).send({ message: "Not found" });
    }

    res.send(await hydrateOrder(sql, orders[0]));
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const sql = getSql(req);
    const body = OrderWriteSchema.parse(req.body);
    const { userId, productIds } = body;
    const payment = normalizePayment(body.payment);
    const references = await ensureReferencesExist(sql, userId, productIds);

    if (!references.ok) {
      return res.status(404).send({ message: references.message });
    }

    const total = computeTotal(references.products);

    const orders = await sql`
      INSERT INTO orders ("userId", "productIds", total, payment)
      VALUES (${userId}, ${productIds}, ${total}, ${payment})
      RETURNING *
    `;

    res.status(201).send(await hydrateOrder(sql, orders[0]));
  } catch (error) {
    if (error.message === "Invalid order body") {
      return res.status(400).send({ message: "Invalid order body" });
    }

    console.error(error);
    res.status(500).send({ message: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const sql = getSql(req);
    const body = OrderWriteSchema.parse(req.body);
    const { userId, productIds } = body;
    const payment = normalizePayment(body.payment);
    const references = await ensureReferencesExist(sql, userId, productIds);

    if (!references.ok) {
      return res.status(404).send({ message: references.message });
    }

    const total = computeTotal(references.products);

    const orders = await sql`
      UPDATE orders
      SET "userId" = ${userId}, "productIds" = ${productIds}, total = ${total}, payment = ${payment}, "updatedAt" = NOW()
      WHERE id = ${req.params.id}
      RETURNING *
    `;

    if (orders.length === 0) {
      return res.status(404).send({ message: "Not found" });
    }

    res.send(await hydrateOrder(sql, orders[0]));
  } catch (error) {
    if (error.message === "Invalid order body") {
      return res.status(400).send({ message: "Invalid order body" });
    }

    console.error(error);
    res.status(500).send({ message: "Internal server error" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const sql = getSql(req);
    const body = OrderPatchSchema.parse(req.body);
    const existingOrders = await sql`
      SELECT *
      FROM orders
      WHERE id = ${req.params.id}
    `;

    if (existingOrders.length === 0) {
      return res.status(404).send({ message: "Not found" });
    }

    const currentOrder = existingOrders[0];
    const userId = body.userId ?? getOrderValue(currentOrder, "userId", "userid");
    const productIds = body.productIds ?? getOrderValue(currentOrder, "productIds", "productids");
    const payment = body.payment ?? currentOrder.payment;
    const references = await ensureReferencesExist(sql, userId, productIds);

    if (!references.ok) {
      return res.status(404).send({ message: references.message });
    }

    const total = computeTotal(references.products);

    const orders = await sql`
      UPDATE orders
      SET "userId" = ${userId}, "productIds" = ${productIds}, total = ${total}, payment = ${payment}, "updatedAt" = NOW()
      WHERE id = ${req.params.id}
      RETURNING *
    `;

    res.send(await hydrateOrder(sql, orders[0]));
  } catch (error) {
    if (error.message === "At least one field is required") {
      return res.status(400).send({ message: "At least one field is required" });
    }

    if (error.message === "Invalid userId" || error.message === "Invalid productIds" || error.message === "Invalid payment") {
      return res.status(400).send({ message: error.message });
    }

    console.error(error);
    res.status(500).send({ message: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const sql = getSql(req);
    const orders = await sql`
      DELETE FROM orders
      WHERE id = ${req.params.id}
      RETURNING *
    `;

    if (orders.length === 0) {
      return res.status(404).send({ message: "Not found" });
    }

    res.send(await hydrateOrder(sql, orders[0]));
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Internal server error" });
  }
});

module.exports = router;
