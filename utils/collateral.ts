export async function getClaimableCollateralTimeKey() {
  const block = await ethers.provider.getBlock("latest");
  return parseInt(block.timestamp / (60 * 60));
}
