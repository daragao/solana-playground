const solanaWeb3 = require('@solana/web3.js');

const main = async () => {
  const publicKeyStr = 'GU1McqWTXz7ngaLMjgUC2ychCzR2gAXYghAE417Rhrg1';
  const pubKey = new solanaWeb3.PublicKey(publicKeyStr);

  const rpcURL = 'http://127.0.0.1:8899';
  const conn = new solanaWeb3.Connection(rpcURL);

  const printBalance = async (pubKey) => {
    const balance = await conn.getBalance(pubKey);
    console.log(`Balance: ${balance.toString()}`);
  }

  const txSignature = await conn.requestAirdrop(pubKey, solanaWeb3.LAMPORTS_PER_SOL);
  console.log(`txSignature: ${txSignature}`);

  await printBalance(pubKey);

  const confirmedProcessedTx = await conn.confirmTransaction(txSignature, 'processed');
  console.log(`Tx Processed: ${JSON.stringify(confirmedProcessedTx)}`);

  await printBalance(pubKey);

  const confirmedConfirmedTx = await conn.confirmTransaction(txSignature, 'confirmed');
  console.log(`Tx Confirmed: ${JSON.stringify(confirmedConfirmedTx)}`);

  await printBalance(pubKey);

  const confirmedFinalizedTx = await conn.confirmTransaction(txSignature, 'finalized');
  console.log(`Tx Finalized: ${JSON.stringify(confirmedFinalizedTx)}`);

  await printBalance(pubKey);
};

main();
