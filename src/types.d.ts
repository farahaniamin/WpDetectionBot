declare module 'stream-chain' {
  const Chain: new (filters: any[]) => any;
  export default Chain;
}

declare module 'stream-json' {
  function json(options?: any): any;
  export default json;
  export const parser: any;
  export { parser as parser };
}

declare module 'stream-json/streamers/StreamObject.js' {
  const StreamObject: {
    streamObject: () => any;
  };
  export default StreamObject;
}
