declare module "*.png" {
  const content: string;
  export default content;
}

// Para sigurado, isama na rin ang iba pang image types:
declare module "*.jpg" {
  const content: string;
  export default content;
}

declare module "*.jpeg" {
  const content: string;
  export default content;
}

declare module "*.png" {
  const value: string;
  export default value;
}
