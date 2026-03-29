import { ProductCodesProvider } from "./product-codes-context";

export default function ProductCodesLayout({ children }: { children: React.ReactNode }) {
  return <ProductCodesProvider>{children}</ProductCodesProvider>;
}
