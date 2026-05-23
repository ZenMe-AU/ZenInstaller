import sodium from "libsodium-wrappers";

export async function encryptSecret(publicKey, value) {
  await sodium.ready;
  const keyBin = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
  const valueBin = sodium.from_string(value);
  const encrypted = sodium.crypto_box_seal(valueBin, keyBin);
  return sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);
}
