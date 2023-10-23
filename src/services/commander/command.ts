import { Flags, typeFlag, TypeFlag } from 'type-flag';
import { Awaitable, remove } from 'cosmokit';
import { MessageExtra, MessageSession } from '../../types';
import { Bot } from '../../bot';

// 通过模板字符串字面量来推断参数类型
type ParseRequired<T extends string> = T extends `${infer Before} <${infer Param}> ${infer After}`
  ? { [K in Param]: string } & ParseRequired<`${Before} ${After}`>
  : T extends `${infer Before} <${infer Param}>`
  ? { [K in Param]: string }
  : {};

type ParseOptional<T extends string> = T extends `${infer Before} [${infer Param}] ${infer After}`
  ? { [K in Param]?: string } & ParseOptional<`${Before} ${After}`>
  : T extends `${infer Before} [${infer Param}]`
  ? { [K in Param]?: string }
  : {};

type ExtractCommandParams<T extends string> = ParseRequired<T> & ParseOptional<T>;

type callbackFunction<T extends Flags<Record<string, unknown>>, P extends string> = (
  argv: TypeFlag<T> & ExtractCommandParams<P>,
  bot: Bot,
  session: MessageSession<MessageExtra>,
) => Awaitable<void | string>;

export class CommandInstance<T extends Flags, P extends string> {
  readonly name: string;
  readonly description: string;
  readonly options: T;
  commandFunction: callbackFunction<T, P>;

  readonly requiredMatches: string[];
  readonly optionalMatches: string[];

  constructor(name: P, desc: string, options: T) {
    const index: number = name.indexOf(' ');
    this.name = name.substring(0, index);
    this.description = desc;
    this.options = options;

    const others = name.substring(index);
    this.requiredMatches = others.match(/<[^>]+>/g) || [];
    this.optionalMatches = others.match(/\[[^\]]+\]/g) || [];
  }

  action(callback: callbackFunction<T, P>): void {
    this.commandFunction = callback;
  }

  async execute(possible: string, bot: Bot, session: MessageSession<MessageExtra>) {
    let argv = typeFlag(this.options, parseArgsStringToArgv(possible));
    // 移除主指令
    remove(argv._, this.name);
    const params: any = {};

    // 必要参数比对
    if (this.requiredMatches.length > argv._.length) {
      bot.sendMessage(session.channelId, '缺少必要参数', { quote: session.data.msg_id });
      return;
    }

    //分配必填
    for (let i = 0; i < this.requiredMatches.length; i++) {
      const paramName = this.requiredMatches[i].slice(1, -1); // Remove < and > from parameter name
      params[paramName] = argv._[i];
    }

    // 分配选填
    for (
      let i = 0;
      i < this.optionalMatches.length && i + this.requiredMatches.length < argv._.length;
      i++
    ) {
      const paramName = this.optionalMatches[i].slice(1, -1); // Remove [ and ] from parameter name
      params[paramName] = argv._[i + this.requiredMatches.length];
    }

    argv = { ...argv, ...params };
    // 使用推断出的参数类型
    const result = await this.commandFunction(argv as any, bot, session);
    if (result) await bot.sendMessage(session.channelId, result);
  }
}

function parseArgsStringToArgv(value) {
  const args = [];
  let inQuotes = false;
  let escape = false;
  let arg = '';

  for (let i = 0; i < value.length; i++) {
    const current = value[i];

    if (escape) {
      arg += current;
      escape = false;
    } else if (current === '\\') {
      escape = true;
    } else if (current === '"') {
      inQuotes = !inQuotes;
    } else if (current === ' ' && !inQuotes) {
      if (arg.length > 0) {
        args.push(arg);
        arg = '';
      }
    } else {
      arg += current;
    }
  }

  if (arg.length > 0) {
    args.push(arg);
  }

  return args;
}