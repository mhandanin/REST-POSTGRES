const express = require("express");
const postgres = require("postgres");
const z = require("zod");


const app = express();
const port = 8000;
const sql = postgres({ db: "mydb", user: "user", password: "test", port: 5433 });

app.use(express.json());

const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  about: z.string(),
  price: z.number().positive(),
});

const CreateProductSchema = ProductSchema.omit({ id: true });

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/products", async (req, res) => {
  const result = await CreateProductSchema.safeParse(req.body);

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
  const products = await sql`
    SELECT * FROM products
    `;

  res.send(products);
});

app.get("/products/:id", async (req, res) => {
  const product = await sql`
    SELECT * FROM products WHERE id=${req.params.id}
    `;

  if (product.length > 0) {
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

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});