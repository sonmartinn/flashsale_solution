// Dữ liệu API trả về, chỉ khai báo các trường giao diện đang dùng
export interface Product {
  _id: string;
  name: string;
  price: number;
}

export interface FlashSale {
  _id: string;
  // API populate sẵn nên đây là cả sản phẩm, không phải mã
  productId: Product;
  salePrice: number;
  totalQty: number;
  remainingQty: number;
}
