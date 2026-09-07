interface ZhihuEnv {
  ZHIHU_ACCESS_SECRET: string;
}

declare namespace NodeJS {
  interface ProcessEnv extends ZhihuEnv {
    [key: string]: string | undefined;
  }
}
