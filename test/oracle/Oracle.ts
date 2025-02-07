import { expect } from "chai";

import { expandDecimals, decimalToFloat } from "../../utils/math";
import { deployContract } from "../../utils/deploy";
import { hashString } from "../../utils/hash";
import { deployFixture } from "../../utils/fixture";
import {
  TOKEN_ORACLE_TYPES,
  signPrices,
  getSignerInfo,
  getCompactedPrices,
  getCompactedPriceIndexes,
  getCompactedDecimals,
  getCompactedOracleBlockNumbers,
  getCompactedOracleTimestamps,
} from "../../utils/oracle";
import { printGasUsage } from "../../utils/gas";
import { grantRole } from "../../utils/role";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";

describe("Oracle", () => {
  const { provider } = ethers;

  let user0, signer0, signer1, signer2, signer3, signer4, signer7, signer9;
  let roleStore, dataStore, eventEmitter, oracleStore, oracle, wnt, wbtc, usdc;
  let oracleSalt;

  beforeEach(async () => {
    const fixture = await deployFixture();
    ({ user0, signer0, signer1, signer2, signer3, signer4, signer7, signer9 } = fixture.accounts);

    ({ roleStore, dataStore, eventEmitter, oracleStore, oracle, wnt, wbtc, usdc } = fixture.contracts);
    ({ oracleSalt } = fixture.props);
  });

  it("inits", async () => {
    expect(await oracle.oracleStore()).to.eq(oracleStore.address);
  });

  it("validatePrices", async () => {
    // use the previous block, otherwise block.hash would be zero when calling
    // validatePrices
    const block0 = await provider.getBlock((await provider.getBlockNumber()) - 2);
    const block1 = await provider.getBlock((await provider.getBlockNumber()) - 1);

    const signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
    const wntMinPrices = [4990, 4991, 4995, 5000, 5001, 5005, 5007];
    const wntMaxPrices = [4990, 4991, 4995, 5010, 5011, 5015, 5017];
    const wbtcMinPrices = [60100, 60101, 60102, 60110, 60200, 60300, 60500];
    const wbtcMaxPrices = [60100, 60101, 60102, 60510, 60700, 60800, 60900];

    const wntSignatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      minOracleBlockNumber: block0.number - 10,
      maxOracleBlockNumber: block0.number,
      oracleTimestamp: block0.timestamp,
      blockHash: block0.hash,
      token: wnt.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 1,
      minPrices: wntMinPrices,
      maxPrices: wntMaxPrices,
    });

    const wbtcSignatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      minOracleBlockNumber: block1.number - 7,
      maxOracleBlockNumber: block1.number,
      oracleTimestamp: block1.timestamp,
      blockHash: block1.hash,
      token: wbtc.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 2,
      minPrices: wbtcMinPrices,
      maxPrices: wbtcMaxPrices,
    });

    const params = {
      priceFeedTokens: [],
      realtimeFeedTokens: [],
      realtimeFeedData: [],
      signerInfo,
      tokens: [wnt.address, wbtc.address],
      compactedMinOracleBlockNumbers: getCompactedOracleBlockNumbers([block0.number - 10, block1.number - 7]),
      compactedMaxOracleBlockNumbers: getCompactedOracleBlockNumbers([block0.number, block1.number]),
      compactedOracleTimestamps: getCompactedOracleTimestamps([block0.timestamp, block1.timestamp]),
      compactedDecimals: getCompactedDecimals([1, 2]),
      compactedMinPrices: getCompactedPrices(wntMinPrices.concat(wbtcMinPrices)),
      compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
      compactedMaxPrices: getCompactedPrices(wntMaxPrices.concat(wbtcMaxPrices)),
      compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
      signatures: wntSignatures.concat(wbtcSignatures),
    };

    const result = await oracle.validatePrices(dataStore.address, params);

    expect(result.length).eq(2);

    expect(result[0].token).eq(wnt.address);
    expect(result[0].min).eq(50000);
    expect(result[0].max).eq(50100);
    expect(result[0].timestamp).eq(block0.timestamp);
    expect(result[0].minBlockNumber).eq(block0.number - 10);
    expect(result[0].maxBlockNumber).eq(block0.number);

    expect(result[1].token).eq(wbtc.address);
    expect(result[1].min).eq(6011000);
    expect(result[1].max).eq(6051000);
    expect(result[1].timestamp).eq(block1.timestamp);
    expect(result[1].minBlockNumber).eq(block1.number - 7);
    expect(result[1].maxBlockNumber).eq(block1.number);
  });

  it("setPrices", async () => {
    await expect(
      oracle.connect(user0).setPrices(dataStore.address, eventEmitter.address, {
        signerInfo: 2,
        tokens: [],
        compactedMinOracleBlockNumbers: [],
        compactedMaxOracleBlockNumbers: [],
        compactedOracleTimestamps: [],
        compactedDecimals: [],
        compactedMinPrices: [],
        compactedMinPricesIndexes: [],
        compactedMaxPrices: [],
        compactedMaxPricesIndexes: [],
        signatures: [],
        priceFeedTokens: [],
        realtimeFeedTokens: [],
        realtimeFeedData: [],
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user0.address, "CONTROLLER");

    const blockNumber = (await provider.getBlock("latest")).number;
    const blockTimestamp = (await provider.getBlock("latest")).timestamp;

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        signerInfo: 0,
        tokens: [wnt.address],
        compactedMinOracleBlockNumbers: [blockNumber + 10],
        compactedMaxOracleBlockNumbers: [blockNumber + 10],
        compactedOracleTimestamps: [blockTimestamp],
        compactedDecimals: [],
        compactedMinPrices: [],
        compactedMinPricesIndexes: [],
        compactedMaxPrices: [],
        compactedMaxPricesIndexes: [],
        signatures: [],
        priceFeedTokens: [],
        realtimeFeedTokens: [],
        realtimeFeedData: [],
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "InvalidBlockNumber")
      .withArgs(blockNumber + 10, blockNumber + 1);

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        signerInfo: getSignerInfo([0, 1]),
        tokens: [wnt.address],
        compactedMinOracleBlockNumbers: [blockNumber],
        compactedMaxOracleBlockNumbers: [blockNumber],
        compactedOracleTimestamps: [blockTimestamp],
        compactedDecimals: getCompactedDecimals([1]),
        compactedMinPrices: getCompactedPrices([3000, 3000]),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1]),
        compactedMaxPrices: getCompactedPrices([3000, 3000]),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1]),
        signatures: ["0x00", "0x00"],
        priceFeedTokens: [],
        realtimeFeedTokens: [],
        realtimeFeedData: [],
      })
    ).to.be.revertedWith("ECDSA: invalid signature length");

    await dataStore.setUint(keys.MIN_ORACLE_SIGNERS, 3);

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        signerInfo: getSignerInfo([0, 1]),
        tokens: [wnt.address],
        compactedMinOracleBlockNumbers: [blockNumber],
        compactedMaxOracleBlockNumbers: [blockNumber],
        compactedOracleTimestamps: [blockTimestamp],
        compactedDecimals: getCompactedDecimals([1]),
        compactedMinPrices: getCompactedPrices([3000, 3000]),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1]),
        compactedMaxPrices: getCompactedPrices([3000, 3000]),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1]),
        signatures: ["0x00", "0x00"],
        priceFeedTokens: [],
        realtimeFeedTokens: [],
        realtimeFeedData: [],
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "MinOracleSigners")
      .withArgs(2, 3);

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        signerInfo: getSignerInfo([0, 1, 2, 3, 4, 1, 9]),
        tokens: [wnt.address],
        compactedMinOracleBlockNumbers: [blockNumber],
        compactedMaxOracleBlockNumbers: [blockNumber],
        compactedOracleTimestamps: [blockTimestamp],
        compactedDecimals: getCompactedDecimals([1]),
        compactedMinPrices: getCompactedPrices([3000, 3000]),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1]),
        compactedMaxPrices: getCompactedPrices([3000, 3000]),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1]),
        signatures: ["0x00", "0x00"],
        priceFeedTokens: [],
        realtimeFeedTokens: [],
        realtimeFeedData: [],
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "DuplicatedIndex")
      .withArgs(1, "signerIndex");

    let signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
    const block = await provider.getBlock(blockNumber);
    let minPrices = [4990, 4991, 4995, 5000, 5001, 0, 5007];
    let maxPrices = [4990, 4991, 4995, 5000, 5001, 0, 5007];
    let signatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      minOracleBlockNumber: blockNumber,
      maxOracleBlockNumber: blockNumber,
      oracleTimestamp: blockTimestamp,
      blockHash: block.hash,
      token: wnt.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 1,
      minPrices,
      maxPrices,
    });

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        signerInfo,
        tokens: [wnt.address],
        compactedMinOracleBlockNumbers: [blockNumber],
        compactedMaxOracleBlockNumbers: [blockNumber],
        compactedOracleTimestamps: [blockTimestamp],
        compactedDecimals: getCompactedDecimals([1]),
        compactedMinPrices: getCompactedPrices(minPrices),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
        compactedMaxPrices: getCompactedPrices(maxPrices),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
        signatures: signatures,
        priceFeedTokens: [],
        realtimeFeedTokens: [],
        realtimeFeedData: [],
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "EmptyCompactedPrice")
      .withArgs(5);

    signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
    minPrices = [4990, 4990, 4989, 5000, 5001, 5005, 5007];
    maxPrices = [4990, 4990, 4989, 5000, 5001, 5005, 5007];
    signatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      minOracleBlockNumber: blockNumber,
      maxOracleBlockNumber: blockNumber,
      oracleTimestamp: blockTimestamp,
      blockHash: block.hash,
      token: wnt.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 1,
      minPrices,
      maxPrices,
    });

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        realtimeFeedTokens: [],
        realtimeFeedData: [],
        signerInfo,
        tokens: [wnt.address],
        compactedMinOracleBlockNumbers: [blockNumber],
        compactedMaxOracleBlockNumbers: [blockNumber],
        compactedOracleTimestamps: [blockTimestamp],
        compactedDecimals: getCompactedDecimals([1]),
        compactedMinPrices: getCompactedPrices(minPrices),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
        compactedMaxPrices: getCompactedPrices(maxPrices),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
        signatures,
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "MinPricesNotSorted")
      .withArgs(wnt.address, 4989, 4990);

    signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
    minPrices = [4990, 4990, 4991, 5000, 5001, 5005, 5007];
    maxPrices = [4990, 4995, 4979, 5000, 5001, 5005, 5007];
    signatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      minOracleBlockNumber: blockNumber,
      maxOracleBlockNumber: blockNumber,
      oracleTimestamp: blockTimestamp,
      blockHash: block.hash,
      token: wnt.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 1,
      minPrices,
      maxPrices,
    });

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        realtimeFeedTokens: [],
        realtimeFeedData: [],
        signerInfo,
        tokens: [wnt.address],
        compactedMinOracleBlockNumbers: [blockNumber],
        compactedMaxOracleBlockNumbers: [blockNumber],
        compactedOracleTimestamps: [blockTimestamp],
        compactedDecimals: getCompactedDecimals([1]),
        compactedMinPrices: getCompactedPrices(minPrices),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
        compactedMaxPrices: getCompactedPrices(maxPrices),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
        signatures,
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "MaxPricesNotSorted")
      .withArgs(wnt.address, 4979, 4995);

    signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
    minPrices = [4990, 4991, 4995, 5000, 5001, 5005, 5007];
    maxPrices = [4990, 4991, 4995, 5000, 5001, 5005, 5007];
    signatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      minOracleBlockNumber: blockNumber,
      maxOracleBlockNumber: blockNumber,
      oracleTimestamp: blockTimestamp,
      blockHash: block.hash,
      token: wnt.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 1,
      minPrices,
      maxPrices,
    });

    signatures[3] = signatures[4];

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        realtimeFeedTokens: [],
        realtimeFeedData: [],
        signerInfo,
        tokens: [wnt.address],
        compactedMinOracleBlockNumbers: [blockNumber],
        compactedMaxOracleBlockNumbers: [blockNumber],
        compactedOracleTimestamps: [blockTimestamp],
        compactedDecimals: getCompactedDecimals([1]),
        compactedMinPrices: getCompactedPrices(minPrices),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
        compactedMaxPrices: getCompactedPrices(maxPrices),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
        signatures,
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidSignature");

    signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
    minPrices = [4990, 4991, 4995, 5000, 5001, 5005, 5007];
    maxPrices = [4990, 4991, 4995, 5010, 5011, 5015, 5017];
    signatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      minOracleBlockNumber: blockNumber,
      maxOracleBlockNumber: blockNumber,
      oracleTimestamp: blockTimestamp,
      blockHash: block.hash,
      token: wnt.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 1,
      minPrices,
      maxPrices,
    });

    await dataStore.setBytes32(keys.realtimeFeedIdKey(wnt.address), hashString("WNT"));

    await dataStore.setBool(keys.IN_STRICT_PRICE_FEED_MODE, true);

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        realtimeFeedTokens: [],
        realtimeFeedData: [],
        signerInfo,
        tokens: [wnt.address],
        compactedMinOracleBlockNumbers: [blockNumber],
        compactedMaxOracleBlockNumbers: [blockNumber],
        compactedOracleTimestamps: [blockTimestamp],
        compactedDecimals: getCompactedDecimals([1]),
        compactedMinPrices: getCompactedPrices(minPrices),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
        compactedMaxPrices: getCompactedPrices(maxPrices),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
        signatures,
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "HasRealtimeFeedId")
      .withArgs(wnt.address, hashString("WNT"));

    await dataStore.setBool(keys.IN_STRICT_PRICE_FEED_MODE, false);

    const wntPriceFeed = await deployContract("MockPriceFeed", []);
    await dataStore.setAddress(keys.priceFeedKey(wnt.address), wntPriceFeed.address);
    await dataStore.setUint(keys.priceFeedMultiplierKey(wnt.address), expandDecimals(1, 31));
    await dataStore.setUint(keys.priceFeedHeartbeatDurationKey(wnt.address), 60 * 60);
    await dataStore.setUint(keys.MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR, decimalToFloat(5, 1)); // 50%

    await wntPriceFeed.setAnswer(12_000);

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        realtimeFeedTokens: [],
        realtimeFeedData: [],
        signerInfo,
        tokens: [wnt.address],
        compactedMinOracleBlockNumbers: [blockNumber],
        compactedMaxOracleBlockNumbers: [blockNumber],
        compactedOracleTimestamps: [blockTimestamp],
        compactedDecimals: getCompactedDecimals([1]),
        compactedMinPrices: getCompactedPrices(minPrices),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
        compactedMaxPrices: getCompactedPrices(maxPrices),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
        signatures,
      })
    ).to.be.revertedWithCustomError(errorsContract, "MaxRefPriceDeviationExceeded");

    await wntPriceFeed.setAnswer(5000);

    const tx0 = await oracle.setPrices(dataStore.address, eventEmitter.address, {
      priceFeedTokens: [],
      realtimeFeedTokens: [],
      realtimeFeedData: [],
      signerInfo,
      tokens: [wnt.address],
      compactedMinOracleBlockNumbers: [blockNumber],
      compactedMaxOracleBlockNumbers: [blockNumber],
      compactedOracleTimestamps: [blockTimestamp],
      compactedDecimals: getCompactedDecimals([1]),
      compactedMinPrices: getCompactedPrices(minPrices),
      compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
      compactedMaxPrices: getCompactedPrices(maxPrices),
      compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
      signatures,
    });

    await printGasUsage(provider, tx0, "oracle.setPrices tx0");

    expect((await oracle.getPrimaryPrice(wnt.address)).min).eq(50000);
    expect((await oracle.getPrimaryPrice(wnt.address)).max).eq(50100);

    signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
    const wntMinPrices = [4990, 4991, 4995, 5000, 5001, 5005, 5007];
    const wntMaxPrices = [4990, 4991, 4995, 5010, 5011, 5015, 5017];
    const wbtcMinPrices = [60100, 60101, 60102, 60110, 60200, 60300, 60500];
    const wbtcMaxPrices = [60100, 60101, 60102, 60510, 60700, 60800, 60900];

    let wntSignatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      minOracleBlockNumber: blockNumber,
      maxOracleBlockNumber: blockNumber,
      oracleTimestamp: blockTimestamp,
      blockHash: block.hash,
      token: wnt.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 1,
      minPrices: wntMinPrices,
      maxPrices: wntMaxPrices,
    });

    let wbtcSignatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      minOracleBlockNumber: blockNumber,
      maxOracleBlockNumber: blockNumber,
      oracleTimestamp: blockTimestamp,
      blockHash: block.hash,
      token: wbtc.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 2,
      minPrices: wbtcMinPrices,
      maxPrices: wbtcMaxPrices,
    });

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        realtimeFeedTokens: [],
        realtimeFeedData: [],
        signerInfo,
        tokens: [wnt.address, wbtc.address],
        compactedMinOracleBlockNumbers: [blockNumber],
        compactedMaxOracleBlockNumbers: [blockNumber],
        compactedOracleTimestamps: [blockTimestamp],
        compactedDecimals: getCompactedDecimals([1, 2]),
        compactedMinPrices: getCompactedPrices(wntMinPrices.concat(wbtcMinPrices)),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
        compactedMaxPrices: getCompactedPrices(wntMaxPrices.concat(wbtcMaxPrices)),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
        signatures: wntSignatures.concat(wbtcSignatures),
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "NonEmptyTokensWithPrices")
      .withArgs(1);

    await oracle.clearAllPrices();

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        realtimeFeedTokens: [],
        realtimeFeedData: [],
        signerInfo,
        tokens: [wnt.address, wbtc.address],
        compactedMinOracleBlockNumbers: getCompactedOracleBlockNumbers([blockNumber]),
        compactedMaxOracleBlockNumbers: getCompactedOracleBlockNumbers([blockNumber]),
        compactedOracleTimestamps: getCompactedOracleTimestamps([blockTimestamp]),
        compactedDecimals: getCompactedDecimals([1, 2]),
        compactedMinPrices: getCompactedPrices(wntMinPrices.concat(wbtcMinPrices)),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
        compactedMaxPrices: getCompactedPrices(wntMaxPrices.concat(wbtcMaxPrices)),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
        signatures: wntSignatures.concat(wbtcSignatures),
      })
    ).to.be.revertedWithCustomError(errorsContract, "EmptyCompactedBlockNumber");

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        realtimeFeedTokens: [],
        realtimeFeedData: [],
        signerInfo,
        tokens: [wbtc.address, wnt.address],
        compactedMinOracleBlockNumbers: getCompactedOracleBlockNumbers([blockNumber, blockNumber]),
        compactedMaxOracleBlockNumbers: getCompactedOracleBlockNumbers([blockNumber, blockNumber]),
        compactedOracleTimestamps: getCompactedOracleTimestamps([blockTimestamp, blockTimestamp]),
        compactedDecimals: getCompactedDecimals([1, 2]),
        compactedMinPrices: getCompactedPrices(wntMinPrices.concat(wbtcMinPrices)),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
        compactedMaxPrices: getCompactedPrices(wntMaxPrices.concat(wbtcMaxPrices)),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
        signatures: wntSignatures.concat(wbtcSignatures),
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidSignature");

    const params = {
      priceFeedTokens: [],
      realtimeFeedTokens: [],
      realtimeFeedData: [],
      signerInfo,
      tokens: [wnt.address, wbtc.address],
      compactedMinOracleBlockNumbers: getCompactedOracleBlockNumbers([blockNumber, blockNumber]),
      compactedMaxOracleBlockNumbers: getCompactedOracleBlockNumbers([blockNumber, blockNumber]),
      compactedOracleTimestamps: getCompactedOracleTimestamps([blockTimestamp, blockTimestamp]),
      compactedDecimals: getCompactedDecimals([1, 2]),
      compactedMinPrices: getCompactedPrices(wntMinPrices.concat(wbtcMinPrices)),
      compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
      compactedMaxPrices: getCompactedPrices(wntMaxPrices.concat(wbtcMaxPrices)),
      compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
      signatures: wntSignatures.concat(wbtcSignatures),
    };

    const tx1 = await oracle.setPrices(dataStore.address, eventEmitter.address, params);

    await printGasUsage(provider, tx1, "oracle.setPrices tx1");

    expect((await oracle.getPrimaryPrice(wnt.address)).min).eq(50000);
    expect((await oracle.getPrimaryPrice(wnt.address)).max).eq(50100);
    expect((await oracle.getPrimaryPrice(wbtc.address)).min).eq(6011000);
    expect((await oracle.getPrimaryPrice(wbtc.address)).max).eq(6051000);

    expect(await oracle.getTokensWithPricesCount()).eq(2);
    expect(await oracle.getTokensWithPrices(0, 2)).eql([wnt.address, wbtc.address]);

    await oracle.clearAllPrices();

    const block1 = await provider.getBlock("latest");
    const block0 = await provider.getBlock(block1.number - 1);

    // test set prices with a block range
    wntSignatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      minOracleBlockNumber: block0.number - 10,
      maxOracleBlockNumber: block0.number,
      oracleTimestamp: block0.timestamp,
      blockHash: block0.hash,
      token: wnt.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 1,
      minPrices: wntMinPrices,
      maxPrices: wntMaxPrices,
    });

    wbtcSignatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      minOracleBlockNumber: block1.number - 5,
      maxOracleBlockNumber: block1.number,
      oracleTimestamp: block1.timestamp,
      blockHash: block1.hash,
      token: wbtc.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 2,
      minPrices: wbtcMinPrices,
      maxPrices: wbtcMaxPrices,
    });

    await oracle.setPrices(dataStore.address, eventEmitter.address, {
      priceFeedTokens: [],
      realtimeFeedTokens: [],
      realtimeFeedData: [],
      signerInfo,
      tokens: [wnt.address, wbtc.address],
      compactedMinOracleBlockNumbers: getCompactedOracleBlockNumbers([block0.number - 10, block1.number - 5]),
      compactedMaxOracleBlockNumbers: getCompactedOracleBlockNumbers([block0.number, block1.number]),
      compactedOracleTimestamps: getCompactedOracleTimestamps([block0.timestamp, block1.timestamp]),
      compactedDecimals: getCompactedDecimals([1, 2]),
      compactedMinPrices: getCompactedPrices(wntMinPrices.concat(wbtcMinPrices)),
      compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
      compactedMaxPrices: getCompactedPrices(wntMaxPrices.concat(wbtcMaxPrices)),
      compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
      signatures: wntSignatures.concat(wbtcSignatures),
    });
  });

  it("withOraclePrices", async () => {
    const oracleModuleTest = await deployContract("OracleModuleTest", []);
    await grantRole(roleStore, oracleModuleTest.address, "CONTROLLER");

    const signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);

    const wntPrices = [5990, 5991, 5995, 6010, 6011, 6015, 6017];
    const usdcPrices = [1, 1, 1, 1, 1, 1, 1];

    const block = await provider.getBlock("latest");

    const wntSignatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      minOracleBlockNumber: block.number,
      maxOracleBlockNumber: block.number,
      oracleTimestamp: block.timestamp,
      blockHash: block.hash,
      token: wnt.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 1,
      minPrices: wntPrices,
      maxPrices: wntPrices,
    });

    const usdcSignatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      minOracleBlockNumber: block.number,
      maxOracleBlockNumber: block.number,
      oracleTimestamp: block.timestamp,
      blockHash: block.hash,
      token: usdc.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 6,
      minPrices: usdcPrices,
      maxPrices: usdcPrices,
    });

    const tx0 = await oracleModuleTest.withOraclePricesTest(oracle.address, dataStore.address, eventEmitter.address, {
      signerInfo,
      tokens: [wnt.address],
      compactedMinOracleBlockNumbers: getCompactedOracleBlockNumbers([block.number]),
      compactedMaxOracleBlockNumbers: getCompactedOracleBlockNumbers([block.number]),
      compactedOracleTimestamps: getCompactedOracleTimestamps([block.timestamp]),
      compactedDecimals: getCompactedDecimals([1]),
      compactedMinPrices: getCompactedPrices(wntPrices),
      compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
      compactedMaxPrices: getCompactedPrices(wntPrices),
      compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
      signatures: wntSignatures,
      priceFeedTokens: [usdc.address],
      realtimeFeedTokens: [],
      realtimeFeedData: [],
    });

    await dataStore.setAddress(keys.priceFeedKey(usdc.address), ethers.constants.AddressZero);

    await printGasUsage(provider, tx0, "oracle.withOraclePrices tx0");

    const tx1 = await oracleModuleTest.withOraclePricesTest(oracle.address, dataStore.address, eventEmitter.address, {
      signerInfo,
      tokens: [wnt.address, usdc.address],
      compactedMinOracleBlockNumbers: getCompactedOracleBlockNumbers([block.number, block.number]),
      compactedMaxOracleBlockNumbers: getCompactedOracleBlockNumbers([block.number, block.number]),
      compactedOracleTimestamps: getCompactedOracleTimestamps([block.timestamp, block.timestamp]),
      compactedDecimals: getCompactedDecimals([1, 6]),
      compactedMinPrices: getCompactedPrices(wntPrices.concat(usdcPrices)),
      compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
      compactedMaxPrices: getCompactedPrices(wntPrices.concat(usdcPrices)),
      compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
      signatures: wntSignatures.concat(usdcSignatures),
      priceFeedTokens: [],
      realtimeFeedTokens: [],
      realtimeFeedData: [],
    });

    await printGasUsage(provider, tx1, "oracle.withOraclePrices tx1");

    await expect(
      oracleModuleTest.withOraclePricesTest(oracle.address, dataStore.address, eventEmitter.address, {
        signerInfo,
        tokens: [wnt.address, wnt.address, usdc.address],
        compactedMinOracleBlockNumbers: getCompactedOracleBlockNumbers([block.number, block.number, block.number]),
        compactedMaxOracleBlockNumbers: getCompactedOracleBlockNumbers([block.number, block.number, block.number]),
        compactedOracleTimestamps: getCompactedOracleTimestamps([block.timestamp, block.timestamp, block.timestamp]),
        compactedDecimals: getCompactedDecimals([1, 1, 6]),
        compactedMinPrices: getCompactedPrices(wntPrices.concat(wntPrices).concat(usdcPrices)),
        compactedMinPricesIndexes: getCompactedPriceIndexes([
          0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6,
        ]),
        compactedMaxPrices: getCompactedPrices(wntPrices.concat(wntPrices).concat(usdcPrices)),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([
          0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6,
        ]),
        signatures: wntSignatures.concat(wntSignatures).concat(usdcSignatures),
        priceFeedTokens: [],
        realtimeFeedTokens: [],
        realtimeFeedData: [],
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "PriceAlreadySet")
      .withArgs(wnt.address, 60100, 60100);
  });
});
