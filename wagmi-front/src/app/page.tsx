import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight text-gray-900">
        链上合约交互演示
      </h1>
      <p className="mt-4 text-center text-gray-600">
        基于 Next.js 15 + React 19 + Viem v2 的前端项目，
        演示如何通过浏览器钱包与已部署的 Solidity 合约交互。
      </p>

      <div className="mt-10 grid w-full gap-4 sm:grid-cols-2">
        
        <Link
          href="/nft-market"
          className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
        >
          <h2 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600">
            NFT Market →
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            上架 / 购买 / 取消 NFT，并实时监听链上上架与买卖事件
          </p>
        </Link>
      </div>
    </main>
  );
}
