import "./App.css";
import idl from "./idl.json";
import {
  Connection,
  PublicKey,
  clusterApiUrl,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  Keypair
} from "@solana/web3.js";
import { Program, AnchorProvider, utils, BN } from "@project-serum/anchor";
import { useEffect, useState } from "react";
import { Buffer } from "buffer";
window.Buffer = Buffer;

const programID = new PublicKey(idl.metadata.address);
const network = clusterApiUrl("devnet");
const opts = {
  preflightCommitment: "processed",
};

const App = () => {
  const [walletAddress, setWalletAddress] = useState(null);
  const [campaigns, setCampaigns] = useState([]);

  const getProvider = () => {
    const connection = new Connection(network, opts.preflightCommitment);
    const provider = new AnchorProvider(connection, window.solana, opts.preflightCommitment);
    return provider;
  };

  const checkIfWalletIsConnected = async () => {
    try {
      const { solana } = window;
      if (solana) {
        if (solana.isPhantom) {
          console.log("Phantom wallet found!");
          const response = await solana.connect({ onlyIfTrusted: true });
          console.log("Connected with public key:", response.publicKey.toString());
          setWalletAddress(response.publicKey.toString());
        }
      } else {
        alert("Solana object not found! Get a Phantom wallet");
      }
    } catch (error) {
      console.error(error);
    }
  };

  const connectWallet = async () => {
    const { solana } = window;
    if (solana) {
      const response = await solana.connect();
      console.log("Connected with public key:", response.publicKey.toString());
      setWalletAddress(response.publicKey.toString());
    }
  };

  const getCampaigns = async () => {
    const connection = new Connection(network, opts.preflightCommitment);
    const provider = getProvider();
    const program = new Program(idl, programID, provider);
    Promise.all(
      (await connection.getProgramAccounts(programID)).map(async (campaign) => ({
        ...(await program.account.campaign.fetch(campaign.pubkey)),
        pubkey: campaign.pubkey,
      }))
    ).then((campaigns) => setCampaigns(campaigns));
  };

  const createCampaign = async () => {
    try {
      const provider = getProvider();
      const { connection, wallet } = provider;
  
      if (!wallet.publicKey) {
        throw new Error("Wallet is not connected");
      }
  
      const program = new Program(idl, programID, provider);
      const newKeypair = Keypair.generate();
      console.log("Generated new Keypair:", newKeypair.publicKey.toString());
  
      const [campaign, bump] = await PublicKey.findProgramAddress(
        [
          utils.bytes.utf8.encode("CAMPAIGN_DEMO"),
          wallet.publicKey.toBuffer(),
        ],
        program.programId
      );
  
      console.log("Campaign address:", campaign.toString());
  
      const lamports = await connection.getMinimumBalanceForRentExemption(0); // Adjust space and lamports as needed
      console.log("Lamports for rent exemption:", lamports);
  
      // Create the transaction
      const transaction = new Transaction({
        feePayer: wallet.publicKey,
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
      });
  
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: wallet.publicKey,
          newAccountPubkey: newKeypair.publicKey,
          space: 0, // Adjust space as needed
          lamports,
          programId: program.programId,
        }),
        program.instruction.create("campaign name", "campaign description", {
          accounts: {
            campaign,
            user: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          },
          signers: [newKeypair],
        })
      );
  
      // Sign the transaction with the new keypair
      transaction.partialSign(newKeypair);
      console.log("Transaction partially signed with new keypair:", transaction);
  
      // Log transaction details before wallet signing
      console.log("Transaction details before wallet signing:", transaction);
  
      // Sign the transaction with the wallet
      const signedTransaction = await wallet.signTransaction(transaction);
      console.log("Transaction signed with wallet:", signedTransaction);
  
      // Log the signatures
      signedTransaction.signatures.forEach((signature, index) => {
        if (signature.signature) {
          console.log(`Signature ${index}:`, signature.signature.toString("hex"));
        } else {
          console.log(`Signature ${index} is null`);
        }
      });
  
      // Check for the first signature and ensure it is valid
      if (signedTransaction.signatures[0].signature === null) {
        throw new Error(
          "First signature is null, the wallet might not have signed correctly"
        );
      }
  
      // Send and confirm the transaction
      const signature = await connection.sendRawTransaction(
        signedTransaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: "processed",
        }
      );
  
      console.log("Transaction signature:", signature);
      console.log("Created a new campaign w/ address:", campaign.toString());
    } catch (error) {
      console.error("Error creating campaign account:", error);
  
      if (error.logs) {
        console.error("Transaction logs:", error.logs);
      }
    }
  };
  
  
  

  const donate = async (publicKey) => {
    try {
      const provider = getProvider();
      const program = new Program(idl, programID, provider);

      await program.rpc.donate(new BN(0.2 * LAMPORTS_PER_SOL), {
        accounts: {
          campaign: publicKey,
          user: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        },
      });
      console.log("Donated some money to:", publicKey.toString());
      getCampaigns();
    } catch (error) {
      console.error("Error donating:", error);
    }
  };

  const withdraw = async (publicKey) => {
    try {
      const provider = getProvider();
      const program = new Program(idl, programID, provider);
      await program.rpc.withdraw(new BN(0.2 * LAMPORTS_PER_SOL), {
        accounts: {
          campaign: publicKey,
          user: provider.wallet.publicKey,
        },
      });
      console.log("Withdrew some money from:", publicKey.toString());
    } catch (error) {
      console.error("Error withdrawing:", error);
    }
  };

  const renderNotConnectedContainer = () => (
    <button onClick={connectWallet}>Connect to Wallet</button>
  );

  const renderConnectedContainer = () => (
    <>
      <button onClick={createCampaign}>Create a campaign…</button>
      <button onClick={getCampaigns}>Get a list of campaigns…</button>
      <br />
      {campaigns.map((campaign) => (
        <>
          <p>Campaign ID: {campaign.pubkey.toString()}</p>
          <p>
            Balance:{" "}
            {(campaign.amountDonated / LAMPORTS_PER_SOL).toString()}
          </p>
          <p>{campaign.name}</p>
          <p>{campaign.description}</p>
          <button onClick={() => donate(campaign.pubkey)}>Click to donate!</button>
          <button onClick={() => withdraw(campaign.pubkey)}>Click to withdraw!</button>
          <br />
        </>
      ))}
    </>
  );

  useEffect(() => {
    const onLoad = async () => {
      await checkIfWalletIsConnected();
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return (
    <div className="App">
      {!walletAddress && renderNotConnectedContainer()}
      {walletAddress && renderConnectedContainer()}
    </div>
  );
};

export default App;
