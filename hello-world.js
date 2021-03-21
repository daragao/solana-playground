const fs = require('fs');
const solanaWeb3 = require('@solana/web3.js');
const BufferLayout = require('buffer-layout');

const PROGRAM_PATH = 'program/dist/program/solana_bpf_helloworld.so';

const printBalance = async (conn, pubKey) => {
  const balance = await conn.getBalance(pubKey);
  console.log(`Balance of ${pubKey.toString()} is ${balance/solanaWeb3.LAMPORTS_PER_SOL} Sol`);
}

const printConfirmation = async (conn, txSignature) => {
  console.log(`Waiting confirmation for transaction ${txSignature}`);
  const confirmedProcessedTx = await conn.confirmTransaction(txSignature, 'processed');
  console.log(`\tProcessed: ${JSON.stringify(confirmedProcessedTx)}`);

  const confirmedConfirmedTx = await conn.confirmTransaction(txSignature, 'confirmed');
  console.log(`\tConfirmed: ${JSON.stringify(confirmedConfirmedTx)}`);

  const confirmedFinalizedTx = await conn.confirmTransaction(txSignature, 'finalized');
  console.log(`\tFinalized: ${JSON.stringify(confirmedFinalizedTx)}`);
}

const connect = async (url) => {
  const connection = new solanaWeb3.Connection(url/*, 'singleGossip'*/);
  const version = await connection.getVersion();
  console.log('Connection to cluster established:', url, version);
  return connection;
}

const createAndFundPayer = async (conn) => {
  const {feeCalculator} = await conn.getRecentBlockhash();

  // Calculate the cost to load the program
  const data = await fs.readFileSync(PROGRAM_PATH); // TODO make sure this is correct

  const minSignaturesNeeded = solanaWeb3.BpfLoader.getMinNumSignatures(data.length);
  const minBalanceForRentExemption = await conn.getMinimumBalanceForRentExemption(data.length);

  const NUM_RETRIES = 500; // allow some number of retries

  let fees = 0;
  fees +=
    feeCalculator.lamportsPerSignature *
    (minSignaturesNeeded + NUM_RETRIES) +
    (minBalanceForRentExemption);

  // Calculate the cost of sending the transactions
  fees += feeCalculator.lamportsPerSignature * 100; // wag

  // create payer account and request funds
  const payerAccount = new solanaWeb3.Account();
  console.log(`Requesting airdrop for account ${payerAccount.publicKey.toBase58()} of ${fees/solanaWeb3.LAMPORTS_PER_SOL} Sol`)
  const airdropSignature = await conn.requestAirdrop(payerAccount.publicKey, fees);
  await printConfirmation(conn, airdropSignature);

  return payerAccount;
}

const loadProgram = async (conn, payerAccount) => {
  const data = await fs.readFileSync(PROGRAM_PATH); // TODO make sure this is correct

  const programAccount = new solanaWeb3.Account();
  console.log(`Loading program to ${programAccount.publicKey.toBase58()}`);
  const ok = await solanaWeb3.BpfLoader.load(
    conn,
    payerAccount,
    programAccount,
    data,
    solanaWeb3.BPF_LOADER_PROGRAM_ID,
  );

  if(!ok) throw new Error('Program not loaded!');

  return programAccount;
};

const createStorageAccount = async (conn, payerAccount, programAccount) => {
  // Create the greeted account
  const storageAccount = new solanaWeb3.Account();

  const storageAccountDataLayout = BufferLayout.struct([ BufferLayout.u32('numGreets') ]);

  const space = storageAccountDataLayout.span;
  const lamports = await conn.getMinimumBalanceForRentExemption(space);
  const instruction = solanaWeb3.SystemProgram.createAccount({
    fromPubkey: payerAccount.publicKey,
    newAccountPubkey: storageAccount.publicKey,
    lamports,
    space,
    programId: programAccount.publicKey,
  });
  const transaction = new solanaWeb3.Transaction().add(instruction);
  console.log(`Create program storage in ${storageAccount.publicKey}`);
  const txSignature = await solanaWeb3.sendAndConfirmTransaction(
    conn,
    transaction,
    [payerAccount, storageAccount],
    {
      commitment: 'singleGossip',
      preflightCommitment: 'singleGossip',
    },
  );
  await printConfirmation(conn, txSignature);

  return storageAccount;
};

const runFunction = async (conn, payerAccount, programAccount, storageAccount) => {
  const instruction = new solanaWeb3.TransactionInstruction({
    keys: [{pubkey: storageAccount.publicKey, isSigner: false, isWritable: true}],
    programId: programAccount.publicKey,
    data: Buffer.alloc(0), // All instructions are hellos
  });
  console.log(`Run function`);
  const txSignature = await solanaWeb3.sendAndConfirmTransaction(
    conn,
    new solanaWeb3.Transaction().add(instruction),
    [payerAccount],
    {
      commitment: 'singleGossip',
      preflightCommitment: 'singleGossip',
    },
  );
  await printConfirmation(conn, txSignature);
};

const readStorage = async (conn, payerAccount, programAccount, storageAccount) => {
  const accountInfo = await conn.getAccountInfo(storageAccount.publicKey);
  if (accountInfo === null) {
    throw 'Error: cannot find the greeted account';
  }
  const storageAccountDataLayout = BufferLayout.struct([ BufferLayout.u32('numGreets') ]);
  const info = storageAccountDataLayout.decode(Buffer.from(accountInfo.data));
  console.log(
    storageAccount.publicKey.toBase58(),
    'has been greeted',
    info.numGreets.toString(),
    'times',
  );
};

const main = async () => {
  const url = 'http://127.0.0.1:8899';
  const conn = await connect(url);

  const payer = await createAndFundPayer(conn);

  await printBalance(conn, payer.publicKey);

  const programAccount = await loadProgram(conn, payer);

  const storageAccount = await createStorageAccount(conn, payer, programAccount);

  await runFunction(conn, payer, programAccount, storageAccount);

  await readStorage(conn, payer, programAccount, storageAccount);

  await printBalance(conn, payer.publicKey);
};

try{
  main();
} catch (err) {
  console.error(err);
}
