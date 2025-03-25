require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { TIME_TYPE } = require("./src/enums");
const { getTokenPrices, getTimeTypeTokenPrices } = require("./src/db");
const { runChron } = require('./chron');
const tokensData = require("./src/tokens.json");

const app = express();

app.use(cors());
app.options("*", cors());

app.get("/getPrices", async (req, res) => {
  const { tokenAddress, fromTime, toTime } = req.query;
  let prices = [];
  try {
    prices = await getTokenPrices(tokenAddress, fromTime, toTime);
  } catch (e) {
    console.log(e);
  }
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json(prices);
});

app.get("/getCandlePrices", async (req, res) => {
  const { tokenAddress, fromTime, toTime } = req.query;
  let timeType = TIME_TYPE.per_hour;
  if (toTime - fromTime > 60 * 60 * 24 * 7) {
    timeType = TIME_TYPE.per_day;
  }
  let prices = [];
  // console.log(tokenAddress, fromTime, toTime, timeType);

  try {
    prices = await getTimeTypeTokenPrices(
      tokenAddress,
      timeType,
      fromTime,
      toTime
    );
  } catch (e) {
    console.log(e);
  }
  console.log(prices);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json(prices);
});

app.get("/isRunning", async (_req, res) => {
  res.send("running");
});

app.get("/getTokenMetadata", async (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json(tokensData);
});

const callbackUrl = process.env.CALLBACK_URL;
if (callbackUrl) {
  app.get(`/${callbackUrl}`, async (_req, res) => {
    res.send("success");
    await runChron();
  });
}

const port = process.env.PORT;
app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
