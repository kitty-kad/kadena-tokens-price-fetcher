const fss = require("fs");
const fs = fss.promises;
const { getTokenToKadena } = require("./pact-api");
const CoinGecko = require("coingecko-api/lib/CoinGecko");
const tokensData = require("./tokens.json");

async function fetchAllPrices() {
  // 1. Get the current KDA price
  const CoinGeckoClient = new CoinGecko();
  const coinGeckoResponse = await retryNetworkRequest(
    async () =>
      CoinGeckoClient.simple.price({ ids: "kadena", vs_currencies: "usd" }),
    "get KDA price in USD from coin gecko"
  );
  const kdaToUsd = coinGeckoResponse?.data?.kadena?.usd;
  if (kdaToUsd == null) {
    throw new Error(`COULD NOT GET KDA PRICE IN USD, got response: ${coinGeckoResponse}`);
  }
  // 2. Go through each token, get the price in KDA and use KDA -> USD calculate USD value
  const prices = [];
  for (const token of tokensData) {
    try {
      const priceInKda = await retryNetworkRequest(
        async () =>
          getTokenToKadena(token.address, token.exchange, token.chainId),
        `fetch ${token.name} in KDA`
      );
      if (priceInKda == null) {
        return;
      }
      const priceInUsd = priceInKda * kdaToUsd;
      prices.push({ tokenAddress: token.address, priceInUsd, priceInKda });
    } catch (e) {
      console.log(`Could not fetch token ${token.address}, got exception ${e}`);
    }
  }
  return prices;
}

async function retryNetworkRequest(f, name) {
  for (let i = 0; i < 5; i++) {
    try {
      const response = await f();
      if (response != null) {
        return response;
      }
    } catch (e) {
      console.log(`Failed request ${name} with error ${e}`);
      // do nothing and try again
    }
    await sleep(1000);
  }
  console.log(`Network request ${name} failed after 3 attempts`);
}

async function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  }).promise();
}
module.exports = { fetchAllPrices };
