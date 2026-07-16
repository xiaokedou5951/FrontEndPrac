export type RefreshFns = {
  balance: () => Promise<void>;
  allowance: () => Promise<void>;
  deposit: () => Promise<void>;
};
