const { Pool } = require("pg");
let pool;
if (process.env.IS_DEV) {
  pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
  });
} else {
  const DB_URL = process.env.DATABASE_URL_V2 ?? process.env.DATABASE_URL;

  pool = new Pool({
    connectionString: DB_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });
}

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

async function getLatestTokenPriceForTimeType(tokenAddress, time_type) {
  const selectQuery = `SELECT * FROM token_prices_timed WHERE token_address=$1
    AND time_type=$2 ORDER BY unix_time DESC LIMIT 1;`;
  const params = [tokenAddress, time_type];
  const results = await executeQuery(selectQuery, params);
  return results?.[0];
}

async function getTimeTypeTokenPrices(
  tokenAddress,
  time_type,
  fromTime,
  toTime
) {
  const selectQuery = `SELECT * FROM token_prices_timed WHERE token_address=$1
    AND time_type=$2 AND unix_time >= $3 and unix_time <= $4;`;
  const params = [tokenAddress, time_type, fromTime, toTime];
  const results = await executeQuery(selectQuery, params);
  return results;
}

async function getTokenPrices(
  tokenAddress,
  fromTime,
  toTime,
  unlimited = false
) {
  if (tokenAddress == null || tokenAddress === "") {
    return [];
  }
  const currTime = Math.floor(new Date().getTime() / 1000);
  fromTime = fromTime ?? currTime - THIRTY_DAYS_SECONDS;
  toTime = toTime ?? currTime;
  const params = [tokenAddress, fromTime, toTime];
  const countQuery = `SELECT count(*) FROM token_prices WHERE token_address = $1
    AND unix_time >= $2 AND unix_time <= $3;`;
  const counts = await executeQuery(countQuery, params);
  const selectWhere = `WHERE token_address = $1
    AND unix_time >= $2 AND unix_time <= $3`;
  let selectQuery = `SELECT * FROM token_prices ${selectWhere};`;
  // If we have too many results, lets reduce how many rows we return
  if (unlimited !== true && counts[0].count >= 250) {
    const modulo = Math.ceil(counts[0].count / 100);
    selectQuery = `
            SELECT t.*
            FROM (
                SELECT *, row_number() OVER(ORDER BY unix_time ASC) AS row
                    FROM token_prices ${selectWhere}
                ) t
            WHERE t.row % ${modulo} = 0;
        `;
  }
  const results = await executeQuery(selectQuery, params);
  return results;
}

async function insertTokenPrices(pricesData) {
  if (pricesData.length === 0) {
    return;
  }
  await createTablesIfNotExists();
  const unixTime = Math.floor(new Date().getTime() / 1000);
  for (const data of pricesData) {
    const query = `INSERT INTO token_prices
        (unix_time,token_address,price_in_usd,price_in_kda)
        VALUES ($1,$2,$3,$4);`;
    const params = [
      unixTime,
      data.tokenAddress,
      data.priceInUsd,
      data.priceInKda,
    ];
    await executeQuery(query, params);
  }
}

async function insertTokenPricesTimeType(pricesData) {
  if (pricesData.length === 0) {
    return;
  }
  await createTablesIfNotExists();
  for (const data of pricesData) {
    const query = `INSERT INTO token_prices_timed
        (time_type, unix_time,token_address,price_in_usd_low,price_in_usd_high, price_in_usd_start, price_in_usd_end, price_in_kda_low, price_in_kda_high, price_in_kda_start, price_in_kda_end)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11);`;
    const params = [
      data.time_type,
      data.unix_time,
      data.token_address,
      data.price_in_usd_low,
      data.price_in_usd_high,
      data.price_in_usd_start,
      data.price_in_usd_end,
      data.price_in_kda_low,
      data.price_in_kda_high,
      data.price_in_kda_start,
      data.price_in_kda_end,
    ];
    await executeQuery(query, params);
  }
}

async function createTablesIfNotExists() {
  const query = `
    CREATE TABLE IF NOT EXISTS "token_prices" (
      "unix_time" BIGINT,
	    "token_address" VARCHAR(32) NOT NULL,
	    "price_in_usd" FLOAT,
        "price_in_kda" FLOAT
    );
    CREATE INDEX IF NOT EXISTS token_address_time ON token_prices (token_address, unix_time);
    CREATE TABLE IF NOT EXISTS "token_prices_timed" (
        "time_type" VARCHAR(16),
        "unix_time" BIGINT,
	    "token_address" VARCHAR(32) NOT NULL,
	    "price_in_usd_low" FLOAT,
        "price_in_usd_high" FLOAT,
        "price_in_usd_start" FLOAT,
        "price_in_usd_end" FLOAT,
        "price_in_kda_low" FLOAT,
        "price_in_kda_high" FLOAT,
        "price_in_kda_start" FLOAT,
        "price_in_kda_end" FLOAT
    );
    CREATE INDEX IF NOT EXISTS token_address_time ON token_prices_timed (token_address, time_type, unix_time);
    ALTER TABLE "token_prices" ALTER COLUMN "token_address" TYPE VARCHAR(128);
    ALTER TABLE "token_prices_timed" ALTER COLUMN "token_address" TYPE VARCHAR(128);
    `;
  executeQuery(query);
}

async function executeQuery(query, params = []) {
  try {
    const res = await pool.query(query, params);
    return res.rows;
  } catch (error) {
    console.error(error.stack);
    return [];
  }
}

module.exports = {
  getTokenPrices,
  insertTokenPrices,
  getLatestTokenPriceForTimeType,
  insertTokenPricesTimeType,
  getTimeTypeTokenPrices,
};
