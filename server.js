const express = require("express");
const postgres = require("postgres");
const crypto = require("crypto");
const z = require("zod");
const f2pGamesRouter = require("./exercice2");
const ordersRouter = require("./exercice4");
const reviewsRouter = require("./exercice5");

const app = express();
const port = 8000;
const sql = postgres({ db: "mydb", user: "user", password: "test", port: 5433 });

app.use(express.json());
app.locals.sql = sql;

const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  about: z.string(),
  price: z.number().positive(),
});

const CreateProductSchema = ProductSchema.omit({ id: true });

const UserSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  email: z.string().email(),
});

const CreateUserSchema = UserSchema;
const UpdateUserSchema = UserSchema;
const PatchUserSchema = UserSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: "At least one field is required",
});

const hashPassword = (password) => crypto.createHash("sha512").update(password).digest("hex");

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/products", async (req, res) => {
  const result = CreateProductSchema.safeParse(req.body);

  if (result.success) {
    const { name, about, price } = result.data;

    const product = await sql`
      INSERT INTO products (name, about, price)
      VALUES (${name}, ${about}, ${price})
      RETURNING *
    `;

    res.send(product[0]);
  } else {
    res.status(400).send(result);
  }
});

app.get("/products", async (req, res) => {
  const { name, about, price } = req.query;
  const parsedPrice = price === undefined ? null : Number(price);

  if (price !== undefined && Number.isNaN(parsedPrice)) {
    return res.status(400).send({ message: "Invalid price" });
  }

  const products = await sql`
    SELECT *
    FROM products
    WHERE
      (${name ?? null}::text IS NULL OR name ILIKE ${`%${name ?? ""}%`})
      AND (${about ?? null}::text IS NULL OR about ILIKE ${`%${about ?? ""}%`})
      AND (${parsedPrice}::numeric IS NULL OR price <= ${parsedPrice})
  `;

  res.send(products);
});

app.get("/products/:id", async (req, res) => {
  const product = await sql`
    SELECT * FROM products WHERE id=${req.params.id}
    `;

  if (product.length > 0) {
    const reviews = await sql`SELECT * FROM reviews WHERE "productId" = ${product[0].id} ORDER BY "createdAt" DESC`;
    product[0].reviews = reviews;
    res.send(product[0]);
  } else {
    res.status(404).send({ message: "Not found" });
  }
});

app.delete("/products/:id", async (req, res) => {
  const product = await sql`
    DELETE FROM products
    WHERE id=${req.params.id}
    RETURNING *
    `;

  if (product.length > 0) {
    res.send(product[0]);
  } else {
    res.status(404).send({ message: "Not found" });
  }
});

// Users: only POST, PUT, PATCH as required by Exercise 1
app.post("/users", async (req, res) => {
  const result = CreateUserSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).send(result);
  }

  try {
    const { username, password, email } = result.data;
    const hashedPassword = hashPassword(password);

    const users = await sql`
      INSERT INTO users (username, password, email)
      VALUES (${username}, ${hashedPassword}, ${email})
      RETURNING id, username, email
    `;

    res.status(201).send(users[0]);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Internal server error" });
  }
});

app.put("/users/:id", async (req, res) => {
  const result = UpdateUserSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).send(result);
  }

  try {
    const { username, password, email } = result.data;
    const hashedPassword = hashPassword(password);

    const users = await sql`
      UPDATE users
      SET username = ${username}, password = ${hashedPassword}, email = ${email}
      WHERE id = ${req.params.id}
      RETURNING id, username, email
    `;

    if (users.length > 0) {
      res.send(users[0]);
    } else {
      res.status(404).send({ message: "Not found" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Internal server error" });
  }
});

app.patch("/users/:id", async (req, res) => {
  const result = PatchUserSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).send(result);
  }

  try {
    const { username, password, email } = result.data;

    const users = await sql`
      UPDATE users
      SET
        username = COALESCE(${username ?? null}, username),
        password = COALESCE(${password ? hashPassword(password) : null}, password),
        email = COALESCE(${email ?? null}, email)
      WHERE id = ${req.params.id}
      RETURNING id, username, email
    `;

    if (users.length > 0) {
      res.send(users[0]);
    } else {
      res.status(404).send({ message: "Not found" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Internal server error" });
  }
});

app.use("/f2p-games", f2pGamesRouter);
app.use("/orders", ordersRouter);
app.use("/reviews", reviewsRouter);
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./openapi.json');

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));


app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});


