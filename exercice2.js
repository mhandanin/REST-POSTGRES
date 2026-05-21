const express = require("express");

const router = express.Router();
const baseUrl = "https://www.freetogame.com/api";

router.get("/", async (req, res) => {
  try {
    const response = await fetch(`${baseUrl}/games`);

    if (!response.ok) {
      return res.status(502).send({ message: "Unable to reach FreeToGame" });
    }

    const games = await response.json();
    res.send(games);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).send({ message: "Invalid id" });
  }

  try {
    const response = await fetch(`${baseUrl}/game?id=${id}`);

    if (!response.ok) {
      return res.status(502).send({ message: "Unable to reach FreeToGame" });
    }

    const game = await response.json();

    if (!game || !game.id) {
      return res.status(404).send({ message: "Not found" });
    }

    res.send(game);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Internal server error" });
  }
});

module.exports = router;
