// S39O-cs-apierrors: 识别与建议共用的大模型调用错误分类。
// 实现 定义错误种类枚举与用户可读文案映射的类型侧。
// 原理 分类放在契约文件里，UI 与客户端都引用同一份，避免文案与判断分支各写一套。
export type ApiErrorKind =
  | 'auth'
  | 'balance'
  | 'rate'
  | 'server'
  | 'timeout'
  | 'offline'
  | 'request'
  | 'parse';
