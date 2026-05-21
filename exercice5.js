const express = require("express");
const router = express.Router();

router.post("/", async (req, res) => {
  const sql = req.app.locals.sql;
  const { userId, productId, score, content } = req.body;
  if (!userId || !productId || typeof score !== "number") {
    return res.status(400).send({ message: "userId, productId and numeric score required" });
  }
  if (score < 1 || score > 5) return res.status(400).send({ message: "score must be 1..5" });

  const user = await sql`SELECT id FROM users WHERE id=${userId}`;
  if (!user.length) return res.status(400).send({ message: "userId not found" });
  const product = await sql`SELECT id FROM products WHERE id=${productId}`;
  if (!product.length) return res.status(400).send({ message: "productId not found" });

  const inserted = await sql`
    INSERT INTO reviews ("userId","productId",score,content)
    VALUES (${userId}, ${productId}, ${score}, ${content})
    RETURNING *
  `;

  const review = inserted[0];

  await sql`
    UPDATE products
    SET "reviewIds" = array_append(COALESCE("reviewIds", '{}'::int[]), ${review.id}),
        score = COALESCE(score,0) + ${score}
    WHERE id = ${productId}
  `;

  res.status(201).send(review);
});

module.exports = router;
