import { Game } from "../models/Game.js";

const fallbackGames = [
  {
    id: "aviator-rush",
    name: "Aviator Rush",
    tag: "Crash Game",
    image: "https://picsum.photos/400?random=1"
  },
  {
    id: "mega-wheel",
    name: "Mega Wheel",
    tag: "Live Spin",
    image: "https://picsum.photos/400?random=2"
  },
  {
    id: "slots-mania",
    name: "Slots Mania",
    tag: "Slots",
    image: "https://picsum.photos/400?random=3"
  },
  {
    id: "crash-x",
    name: "Crash X",
    tag: "High Risk",
    image: "https://picsum.photos/400?random=4"
  },
  {
    id: "dice-duel",
    name: "Dice Duel",
    tag: "Instant",
    image: "https://picsum.photos/400?random=5"
  },
  {
    id: "roulette-pro",
    name: "Roulette Pro",
    tag: "Casino",
    image: "https://picsum.photos/400?random=6"
  }
];

// GET /api/games
export async function listGames(req, res) {
  const dbGames = await Game.find({ isActive: true }).lean();
  if (!dbGames.length) return res.json(fallbackGames);

  const mapped = dbGames.map((g) => ({
    id: g._id.toString(),
    name: g.name,
    tag: g.tag,
    image: g.image
  }));
  res.json(mapped);
}

// GET /api/games/:id
export async function getGameById(req, res) {
  const { id } = req.params;

  // allow ObjectId or seed id
  const dbGame = await Game.findById(id).lean();
  if (dbGame) {
    return res.json({
      id: dbGame._id,
      name: dbGame.name,
      tag: dbGame.tag,
      image: dbGame.image
    });
  }

  const fallback = fallbackGames.find((g) => g.id === id);
  if (fallback) return res.json(fallback);

  res.status(404).json({ message: "Game not found" });
}
