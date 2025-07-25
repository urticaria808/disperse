import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import { type BaseError, isAddress } from "viem";
import { useReadContracts } from "wagmi";
import { erc20 } from "../contracts";
import { disperse_legacy } from "../deploy";
import type { DebugParam, TokenInfo } from "../types";

// Debug function to log TokenLoader events
const debug = (message: string, data?: DebugParam) => {
  console.log(`[TOKEN-LOADER] ${message}`, data || "");
};

interface TokenLoaderProps {
  onSelect: (token: TokenInfo) => void;
  onError: () => void;
  chainId?: number;
  account?: `0x${string}`;
  token?: TokenInfo; // Pass the current token to preserve state
  contractAddress?: `0x${string}`; // Optional prop for disperse contract address
}

const TokenLoader = ({ onSelect, onError, chainId, account, token, contractAddress }: TokenLoaderProps) => {
  // Initialize tokenAddress with token.address if available
  const [tokenAddress, setTokenAddress] = useState<`0x${string}` | "">(token?.address || "");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const disperseContractAddress = contractAddress || (disperse_legacy.address as `0x${string}`);

  // Update tokenAddress if token prop changes
  useEffect(() => {
    if (token?.address && token.address !== tokenAddress) {
      setTokenAddress(token.address);
    }
  }, [token?.address, tokenAddress]);

  debug("Component rendered", {
    tokenAddress,
    isLoading,
    isSubmitted,
    chainId,
    account,
    disperseContractAddress,
  });

  // Use wagmi's useReadContracts to batch all token data calls
  const { data } = useReadContracts({
    contracts: [
      {
        address: tokenAddress as `0x${string}`,
        abi: erc20.abi,
        functionName: "name",
        chainId,
      },
      {
        address: tokenAddress as `0x${string}`,
        abi: erc20.abi,
        functionName: "symbol",
        chainId,
      },
      {
        address: tokenAddress as `0x${string}`,
        abi: erc20.abi,
        functionName: "decimals",
        chainId,
      },
      {
        address: tokenAddress as `0x${string}`,
        abi: erc20.abi,
        functionName: "balanceOf",
        args: [account as `0x${string}`],
        chainId,
      },
      {
        address: tokenAddress as `0x${string}`,
        abi: erc20.abi,
        functionName: "allowance",
        args: [account as `0x${string}`, disperseContractAddress as `0x${string}`],
        chainId,
      },
    ],
    query: {
      enabled: isSubmitted && !!tokenAddress && !!account && !!disperseContractAddress && !!chainId,
      retry: false,
    },
  });

  // Extract individual results
  const nameData = data?.[0]?.result;
  const symbolData = data?.[1]?.result;
  const decimalsData = data?.[2]?.result;
  const balanceData = data?.[3]?.result;
  const allowanceData = data?.[4]?.result;

  // Extract individual errors
  const nameError = data?.[0]?.status === "failure";
  const symbolError = data?.[1]?.status === "failure";
  const decimalsError = data?.[2]?.status === "failure";
  const balanceError = data?.[3]?.status === "failure";
  const allowanceError = data?.[4]?.status === "failure";

  const nameErrorObj = data?.[0]?.error;
  const symbolErrorObj = data?.[1]?.error;
  const decimalsErrorObj = data?.[2]?.error;
  const balanceErrorObj = data?.[3]?.error;
  const allowanceErrorObj = data?.[4]?.error;

  // Log when contract data is received
  useEffect(() => {
    if (isSubmitted) {
      debug("Contract data status", {
        name: nameData,
        symbol: symbolData,
        decimals: decimalsData,
        balance: balanceData,
        allowance: allowanceData,
        errors: {
          name: nameError,
          symbol: symbolError,
          decimals: decimalsError,
          balance: balanceError,
          allowance: allowanceError,
        },
      });
    }
  }, [
    isSubmitted,
    nameData,
    symbolData,
    decimalsData,
    balanceData,
    allowanceData,
    nameError,
    symbolError,
    decimalsError,
    balanceError,
    allowanceError,
  ]);

  // Use effect to process token data when it's loaded
  useEffect(() => {
    if (!isSubmitted) return;

    // Check for errors and handle them
    if (nameError || symbolError || decimalsError || balanceError || allowanceError) {
      debug("Error loading token data");

      // Get the first error that occurred
      const firstError = nameErrorObj || symbolErrorObj || decimalsErrorObj || balanceErrorObj || allowanceErrorObj;

      // Format error message with shortMessage if available
      const errorMessage = firstError
        ? (firstError as BaseError).shortMessage || firstError.message || "error loading token data"
        : "error loading token data";

      setErrorMessage(errorMessage);
      setIsLoading(false);
      setIsSubmitted(false);
      onError();
      return;
    }

    // Process token data when all data is loaded
    if (
      nameData &&
      symbolData &&
      decimalsData !== undefined &&
      balanceData !== undefined &&
      allowanceData !== undefined
    ) {
      debug("All token data loaded, creating token info");

      const tokenInfo: TokenInfo = {
        address: tokenAddress as `0x${string}`,
        name: nameData as string,
        symbol: symbolData as string,
        decimals: Number(decimalsData),
        balance: balanceData as bigint,
        allowance: allowanceData as bigint,
      };

      debug("Calling onSelect with token info", tokenInfo);
      // Clear any error message on successful token load
      setErrorMessage("");
      onSelect(tokenInfo);
      setIsSubmitted(false);
      setIsLoading(false);
    }
  }, [
    isSubmitted,
    nameData,
    symbolData,
    decimalsData,
    balanceData,
    allowanceData,
    nameError,
    symbolError,
    decimalsError,
    balanceError,
    allowanceError,
    nameErrorObj,
    symbolErrorObj,
    decimalsErrorObj,
    balanceErrorObj,
    allowanceErrorObj,
    onSelect,
    onError,
    tokenAddress,
  ]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setTokenAddress(e.target.value as `0x${string}` | "");
    setErrorMessage("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    debug("Form submitted", { tokenAddress });

    if (!isAddress(tokenAddress)) {
      setErrorMessage("invalid token address");
      return;
    }

    if (!account || !chainId) {
      setErrorMessage("wallet not connected");
      return;
    }

    setIsLoading(true);
    setIsSubmitted(true);
    debug("Token loading started", { tokenAddress, account, disperseContractAddress });
  };

  return (
    <>
      <h2>token address</h2>
      <form onSubmit={handleSubmit}>
        <div className="flex">
          <input
            type="text"
            placeholder="0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359"
            value={tokenAddress}
            onChange={handleChange}
            disabled={isLoading}
            style={{
              flexGrow: 1,
              border: "none",
              borderBottom: "2px #111 solid",
              padding: ".7rem",
              background: "aquamarine",
              marginRight: "1.4rem",
            }}
          />
          <input type="submit" value="load" disabled={isLoading} />
        </div>
        {errorMessage && <p className="error">{errorMessage}</p>}
        {isLoading && <p className="pending">loading token data...</p>}
      </form>
    </>
  );
};

export default TokenLoader;
