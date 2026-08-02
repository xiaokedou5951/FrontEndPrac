import { getProofApiBase } from "@/config/airdropMerkle";

export type ProofResult = {
  proof: `0x${string}`[];
  root: `0x${string}`;
};

// 拉取某地址的 Merkle proof。命中返回 {proof, root}；未命中（404）返回 null；其它错误抛出。
export async function fetchProof(address: string): Promise<ProofResult | null> {
  const base = getProofApiBase().replace(/\/+$/, "");
  const res = await fetch(`${base}/proof/${address}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`获取 proof 失败：${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { proof: string[]; root: string };
  return {
    proof: data.proof as `0x${string}`[],
    root: data.root as `0x${string}`,
  };
}
