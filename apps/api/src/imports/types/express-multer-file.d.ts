declare global {
  namespace Express {
    namespace Multer {
      interface File {
        fileHash?: string;
      }
    }
  }
}

export {};
