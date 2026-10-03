export const REVIEW_RISK_WORDS = /黑哨|黑幕|假球|保送|全网都在骂|确认伤退|确认报销|确认缺席|去骂|网暴|爆破|废物|垃圾|滚出|人种歧视|地域歧视/;

function isNegatedMention(sentence: string, index: number, phrase: string) {
  const before = sentence.slice(0, index);
  if (/^(?:一定|必然|肯定)$/.test(phrase) && before.endsWith("不")) return true;
  const negations = [...before.matchAll(/不要|避免|禁止|严禁|不能|切勿|不建议|不应|不得|反对|并非|不是|删除|不使用|未经证实/g)];
  const last = negations.at(-1);
  if (last) {
    const scope = before.slice(last.index! + last[0].length);
    if (scope.length <= 24 && !/但|却|然而|其实|仍然|还是/.test(scope)) return true;
  }
  const after = sentence.slice(index + phrase.length);
  return /^[”’"']?\s*(?:这种)?(?:说法|定性|标签|指控)?(?:并)?(?:不成立|不准确|不可取|缺乏依据|不应使用)/.test(after);
}

export function findAssertedRiskPhrase(text: string, pattern: RegExp = REVIEW_RISK_WORDS) {
  for (const sentence of text.split(/[。！？；;!?\n，,]/)) {
    const matcher = new RegExp(pattern.source, pattern.flags.replace(/g|y/g, "") + "g");
    for (const match of sentence.matchAll(matcher)) {
      if (!isNegatedMention(sentence, match.index!, match[0])) return match[0];
    }
  }
  return undefined;
}

export function isCautionaryRiskText(text: string) {
  return REVIEW_RISK_WORDS.test(text) && !findAssertedRiskPhrase(text);
}

export function isConcreteAiRisk(sentence: string, reason: string) {
  if (isCautionaryRiskText(sentence)) return false;
  if (findAssertedRiskPhrase(sentence)) return true;
  if (/可能|疑似|尚未确认|待确认|未经确认|无法确认|不确定/.test(sentence)) return false;
  return /人身攻击|侮辱|煽动|造谣|网暴|歧视|泄露隐私/.test(reason);
}
