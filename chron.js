require("dotenv").config();
const { TIME_TYPE } = require("./src/enums");
const { fetchAllPrices } = require("./src/price-fetcher");
const {
  insertTokenPrices,
  getLatestTokenPriceForTimeType,
  getTokenPrices,
  insertTokenPricesTimeType,
} = require("./src/db");
const tokensData = require("./src/tokens.json");

const SECONDS_IN_HOUR = 60 * 60;
const SECONDS_IN_DAY = SECONDS_IN_HOUR * 24;

async function runChron() {
  pricesData = await fetchAllPrices();
  // Insert general data into the database
  await insertTokenPrices(pricesData);
  // Insert specialised timed data
  for (const token of tokensData) {
    try {
      await updatePriceForTimeType(token.address, TIME_TYPE.per_hour);
      await updatePriceForTimeType(token.address, TIME_TYPE.per_day);
    } catch (e) {
      console.log(`Error updating time type data ${e}`);
    }
  }
}

async function updatePriceForTimeType(token_address, time_type) {
  const latestTimeTypeUpdated =
    (await getLatestTokenPriceForTimeType(token_address, time_type))
      ?.unix_time ?? 0;
  const now = Math.round(new Date().getTime() / 1000);
  const nearestTime = roundToTimeType(time_type, now);
  // Check if its worthwhile updating values
  if (!exceededTimeType(time_type, latestTimeTypeUpdated, nearestTime)) {
    return;
  }

  const pricesFromLatestTimeToNow = await getTokenPrices(
    token_address,
    latestTimeTypeUpdated,
    nearestTime,
    true
  );
  if (pricesFromLatestTimeToNow.length === 0) {
    return;
  }
  const dataToSave = [];
  let curr = { token_address, time_type };
  curr.price_in_usd_start = pricesFromLatestTimeToNow[0].price_in_usd;
  curr.price_in_kda_start = pricesFromLatestTimeToNow[0].price_in_kda;
  let currStart = roundToTimeType(time_type, latestTimeTypeUpdated);
  for (const priceData of pricesFromLatestTimeToNow) {
    curr = updateLowsAndHighs(curr, priceData);
    // Set the latest curr data end price
    curr.price_in_usd_end = priceData.price_in_usd;
    curr.price_in_kda_end = priceData.price_in_kda;

    if (exceededTimeType(time_type, currStart, priceData.unix_time)) {
      // Save curr and reset
      currStart = roundToTimeType(time_type, priceData.unix_time);
      dataToSave.push({ ...curr, unix_time: currStart });
      curr = { token_address, time_type };
      curr.price_in_usd_start = priceData.price_in_usd;
      curr.price_in_kda_start = priceData.price_in_kda;
    }
  }
  if (curr.price_in_usd_start != null) {
    dataToSave.push({
      ...curr,
      unix_time: nearestTime,
    });
  }
  insertTokenPricesTimeType(dataToSave);
}

function roundToTimeType(time_type, unix_time) {
  const modulo =
    time_type === TIME_TYPE.per_hour ? SECONDS_IN_HOUR : SECONDS_IN_DAY;
  return unix_time - (unix_time % modulo);
}

function exceededTimeType(time_type, currStart, currRowTime) {
  const exceeds =
    time_type === TIME_TYPE.per_hour ? SECONDS_IN_HOUR : SECONDS_IN_DAY;
  return currRowTime - currStart > exceeds;
}

function updateLowsAndHighs(curr, row) {
  return {
    ...curr,
    price_in_usd_high: Math.max(
      curr.price_in_usd_high ?? 0,
      row.price_in_usd ?? 0
    ),
    price_in_usd_low: Math.min(
      curr.price_in_usd_low ?? Number.MAX_SAFE_INTEGER,
      row.price_in_usd ?? Number.MAX_SAFE_INTEGER
    ),
    price_in_kda_high: Math.max(
      curr.price_in_kda_high ?? 0,
      row.price_in_kda ?? 0
    ),
    price_in_kda_low: Math.min(
      curr.price_in_kda_low ?? Number.MAX_SAFE_INTEGER,
      row.price_in_kda ?? Number.MAX_SAFE_INTEGER
    ),
  };
}

if (!process.env.CALLBACK_URL) {
  runChron();
}

module.exports = { runChron };