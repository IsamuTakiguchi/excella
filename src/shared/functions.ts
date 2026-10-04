/**
 * 関数の一覧と、数式の入力補助（関数名の候補・引数のヒント）のための純粋関数。
 *
 * 実際に使える関数は HyperFormula に登録されているもの（呼び出し側から名前の一覧で渡す）。
 * ここに載せた主な関数だけは日本語の説明と引数を出し、候補の上位に並べる。
 */

export type FunctionCategory =
  '数学/三角' | '統計' | '論理' | '検索/行列' | '日付/時刻' | '文字列操作' | '情報' | '財務'

export type FunctionInfo = {
  name: string
  /** 引数の並び（Excel と同じ書き方。省略できる引数は [ ] で囲む） */
  args: string[]
  description: string
  category: FunctionCategory
}

const f = (
  name: string,
  category: FunctionCategory,
  args: string[],
  description: string,
): FunctionInfo => ({ name, category, args, description })

export const FUNCTION_CATALOG: FunctionInfo[] = [
  f('SUM', '数学/三角', ['数値1', '[数値2]', '...'], 'セル範囲に含まれる数値をすべて合計します。'),
  f(
    'SUMIF',
    '数学/三角',
    ['範囲', '検索条件', '[合計範囲]'],
    '条件に一致するセルの値を合計します。',
  ),
  f(
    'SUMIFS',
    '数学/三角',
    ['合計対象範囲', '条件範囲1', '条件1', '...'],
    '複数の条件に一致するセルの値を合計します。',
  ),
  f('SUMPRODUCT', '数学/三角', ['配列1', '[配列2]', '...'], '配列の対応する要素の積を合計します。'),
  f('PRODUCT', '数学/三角', ['数値1', '[数値2]', '...'], '引数の積を返します。'),
  f('ROUND', '数学/三角', ['数値', '桁数'], '数値を指定した桁数に四捨五入します。'),
  f('ROUNDUP', '数学/三角', ['数値', '桁数'], '数値を指定した桁数に切り上げます。'),
  f('ROUNDDOWN', '数学/三角', ['数値', '桁数'], '数値を指定した桁数で切り捨てます。'),
  f('INT', '数学/三角', ['数値'], '数値を超えない最大の整数を返します。'),
  f('TRUNC', '数学/三角', ['数値', '[桁数]'], '数値の小数部を切り捨てます。'),
  f('ABS', '数学/三角', ['数値'], '数値の絶対値を返します。'),
  f('MOD', '数学/三角', ['数値', '除数'], '割り算の余りを返します。'),
  f('POWER', '数学/三角', ['数値', '指数'], '数値のべき乗を返します。'),
  f('SQRT', '数学/三角', ['数値'], '正の平方根を返します。'),
  f('CEILING', '数学/三角', ['数値', '基準値'], '基準値の倍数に切り上げます。'),
  f('FLOOR', '数学/三角', ['数値', '基準値'], '基準値の倍数に切り捨てます。'),
  f('RAND', '数学/三角', [], '0 以上 1 未満の乱数を返します。'),
  f('RANDBETWEEN', '数学/三角', ['最小値', '最大値'], '指定した範囲の整数の乱数を返します。'),
  f('PI', '数学/三角', [], '円周率を返します。'),
  f('AVERAGE', '統計', ['数値1', '[数値2]', '...'], '引数の平均値を返します。'),
  f(
    'AVERAGEIF',
    '統計',
    ['範囲', '条件', '[平均対象範囲]'],
    '条件に一致するセルの平均を返します。',
  ),
  f('COUNT', '統計', ['値1', '[値2]', '...'], '数値が入っているセルの個数を返します。'),
  f('COUNTA', '統計', ['値1', '[値2]', '...'], '空白でないセルの個数を返します。'),
  f('COUNTBLANK', '統計', ['範囲'], '空白セルの個数を返します。'),
  f('COUNTIF', '統計', ['範囲', '検索条件'], '条件に一致するセルの個数を返します。'),
  f(
    'COUNTIFS',
    '統計',
    ['検索条件範囲1', '検索条件1', '...'],
    '複数の条件に一致するセルの個数を返します。',
  ),
  f('MAX', '統計', ['数値1', '[数値2]', '...'], '引数の最大値を返します。'),
  f('MIN', '統計', ['数値1', '[数値2]', '...'], '引数の最小値を返します。'),
  f(
    'MAXIFS',
    '統計',
    ['最大範囲', '条件範囲1', '条件1', '...'],
    '条件に一致するセルの最大値を返します。',
  ),
  f(
    'MINIFS',
    '統計',
    ['最小範囲', '条件範囲1', '条件1', '...'],
    '条件に一致するセルの最小値を返します。',
  ),
  f('MEDIAN', '統計', ['数値1', '[数値2]', '...'], '中央値を返します。'),
  f('LARGE', '統計', ['配列', '順位'], '大きいほうから数えて指定した順位の値を返します。'),
  f('SMALL', '統計', ['配列', '順位'], '小さいほうから数えて指定した順位の値を返します。'),
  f('STDEV', '統計', ['数値1', '[数値2]', '...'], '標本に基づいて標準偏差を返します。'),
  f('VAR', '統計', ['数値1', '[数値2]', '...'], '標本に基づいて分散を返します。'),
  f(
    'IF',
    '論理',
    ['論理式', '[値が真の場合]', '[値が偽の場合]'],
    '条件が真か偽かで、返す値を切り替えます。',
  ),
  f(
    'IFS',
    '論理',
    ['論理式1', '値が真の場合1', '...'],
    '最初に真になった条件に対応する値を返します。',
  ),
  f('IFERROR', '論理', ['値', 'エラーの場合の値'], 'エラーのときに指定した値を返します。'),
  f('IFNA', '論理', ['値', 'NA の場合の値'], '#N/A のときに指定した値を返します。'),
  f('AND', '論理', ['論理式1', '[論理式2]', '...'], 'すべての引数が真のとき TRUE を返します。'),
  f('OR', '論理', ['論理式1', '[論理式2]', '...'], 'いずれかの引数が真のとき TRUE を返します。'),
  f('NOT', '論理', ['論理式'], '論理値を反転します。'),
  f('SWITCH', '論理', ['式', '値1', '結果1', '...'], '式の値に一致する候補の結果を返します。'),
  f(
    'VLOOKUP',
    '検索/行列',
    ['検索値', '範囲', '列番号', '[検索方法]'],
    '範囲の左端の列で値を探し、同じ行の指定した列の値を返します。',
  ),
  f(
    'HLOOKUP',
    '検索/行列',
    ['検索値', '範囲', '行番号', '[検索方法]'],
    '範囲の上端の行で値を探し、同じ列の指定した行の値を返します。',
  ),
  f(
    'XLOOKUP',
    '検索/行列',
    ['検索値', '検索範囲', '戻り範囲', '[見つからない場合]', '[一致モード]', '[検索モード]'],
    '範囲で値を探し、対応する位置の値を返します。',
  ),
  f('INDEX', '検索/行列', ['配列', '行番号', '[列番号]'], '範囲の中の指定した位置の値を返します。'),
  f(
    'MATCH',
    '検索/行列',
    ['検査値', '検査範囲', '[照合の種類]'],
    '範囲の中で値が何番目にあるかを返します。',
  ),
  f(
    'OFFSET',
    '検索/行列',
    ['参照', '行数', '列数', '[高さ]', '[幅]'],
    '基準からずらした位置の範囲を返します。',
  ),
  f('CHOOSE', '検索/行列', ['インデックス', '値1', '[値2]', '...'], '番号で選んだ値を返します。'),
  f('ROW', '検索/行列', ['[参照]'], 'セルの行番号を返します。'),
  f('COLUMN', '検索/行列', ['[参照]'], 'セルの列番号を返します。'),
  f('ROWS', '検索/行列', ['配列'], '範囲の行数を返します。'),
  f('COLUMNS', '検索/行列', ['配列'], '範囲の列数を返します。'),
  f('TODAY', '日付/時刻', [], '今日の日付を返します。'),
  f('NOW', '日付/時刻', [], '現在の日付と時刻を返します。'),
  f('DATE', '日付/時刻', ['年', '月', '日'], '年・月・日から日付を作ります。'),
  f('TIME', '日付/時刻', ['時', '分', '秒'], '時・分・秒から時刻を作ります。'),
  f('YEAR', '日付/時刻', ['シリアル値'], '日付の年を返します。'),
  f('MONTH', '日付/時刻', ['シリアル値'], '日付の月を返します。'),
  f('DAY', '日付/時刻', ['シリアル値'], '日付の日を返します。'),
  f('HOUR', '日付/時刻', ['シリアル値'], '時刻の時を返します。'),
  f('MINUTE', '日付/時刻', ['シリアル値'], '時刻の分を返します。'),
  f('SECOND', '日付/時刻', ['シリアル値'], '時刻の秒を返します。'),
  f('WEEKDAY', '日付/時刻', ['シリアル値', '[種類]'], '日付の曜日を数値で返します。'),
  f('EDATE', '日付/時刻', ['開始日', '月'], '指定した月数だけ前後の日付を返します。'),
  f('EOMONTH', '日付/時刻', ['開始日', '月'], '指定した月数だけ前後の月末の日付を返します。'),
  f(
    'DATEDIF',
    '日付/時刻',
    ['開始日', '終了日', '単位'],
    '2 つの日付の間の年数・月数・日数を返します。',
  ),
  f(
    'NETWORKDAYS',
    '日付/時刻',
    ['開始日', '終了日', '[祭日]'],
    '土日と祭日を除いた稼働日数を返します。',
  ),
  f(
    'WORKDAY',
    '日付/時刻',
    ['開始日', '日数', '[祭日]'],
    '土日と祭日を除いて指定した日数後の日付を返します。',
  ),
  f('TEXT', '文字列操作', ['値', '表示形式'], '数値を表示形式に従って文字列にします。'),
  f('LEFT', '文字列操作', ['文字列', '[文字数]'], '文字列の先頭から指定した文字数を返します。'),
  f('RIGHT', '文字列操作', ['文字列', '[文字数]'], '文字列の末尾から指定した文字数を返します。'),
  f(
    'MID',
    '文字列操作',
    ['文字列', '開始位置', '文字数'],
    '文字列の途中から指定した文字数を返します。',
  ),
  f('LEN', '文字列操作', ['文字列'], '文字列の文字数を返します。'),
  f(
    'FIND',
    '文字列操作',
    ['検索文字列', '対象', '[開始位置]'],
    '文字列が何文字目にあるかを返します（大文字小文字を区別）。',
  ),
  f(
    'SEARCH',
    '文字列操作',
    ['検索文字列', '対象', '[開始位置]'],
    '文字列が何文字目にあるかを返します（大文字小文字を区別しない）。',
  ),
  f(
    'SUBSTITUTE',
    '文字列操作',
    ['文字列', '検索文字列', '置換文字列', '[置換対象]'],
    '文字列の中の指定した文字を置き換えます。',
  ),
  f(
    'REPLACE',
    '文字列操作',
    ['文字列', '開始位置', '文字数', '置換文字列'],
    '位置を指定して文字列を置き換えます。',
  ),
  f('TRIM', '文字列操作', ['文字列'], '余分な空白を取り除きます。'),
  f('UPPER', '文字列操作', ['文字列'], '英字を大文字にします。'),
  f('LOWER', '文字列操作', ['文字列'], '英字を小文字にします。'),
  f('PROPER', '文字列操作', ['文字列'], '英単語の先頭を大文字にします。'),
  f('CONCATENATE', '文字列操作', ['文字列1', '[文字列2]', '...'], '文字列をつなげます。'),
  f(
    'TEXTJOIN',
    '文字列操作',
    ['区切り文字', '空のセルは無視', '文字列1', '...'],
    '区切り文字をはさんで文字列をつなげます。',
  ),
  f('VALUE', '文字列操作', ['文字列'], '数値を表す文字列を数値にします。'),
  f('REPT', '文字列操作', ['文字列', '繰り返し回数'], '文字列を繰り返します。'),
  f('EXACT', '文字列操作', ['文字列1', '文字列2'], '2 つの文字列が等しいかを調べます。'),
  f('ISBLANK', '情報', ['テストの対象'], '空白セルなら TRUE を返します。'),
  f('ISNUMBER', '情報', ['テストの対象'], '数値なら TRUE を返します。'),
  f('ISTEXT', '情報', ['テストの対象'], '文字列なら TRUE を返します。'),
  f('ISERROR', '情報', ['テストの対象'], 'エラー値なら TRUE を返します。'),
  f(
    'PMT',
    '財務',
    ['利率', '期間', '現在価値', '[将来価値]', '[支払期日]'],
    'ローンの定期支払額を返します。',
  ),
]

const CATALOG_BY_NAME = new Map(FUNCTION_CATALOG.map((info) => [info.name, info]))

export function functionInfo(name: string): FunctionInfo | undefined {
  return CATALOG_BY_NAME.get(name.toUpperCase())
}

/** 関数名に使える文字 */
const NAME_CHAR = /[A-Za-z0-9._]/

/**
 * キャレットの直前で打ちかけている関数名（数式の中だけ）。
 * 文字列リテラルの中や、シート名・数値の途中では null。
 */
export function functionPrefixAt(
  text: string,
  caret: number,
): { start: number; prefix: string } | null {
  if (!text.startsWith('=') || caret < 2) return null
  // 文字列リテラルの中なら補完しない（" の数が奇数）
  let quotes = 0
  for (let i = 0; i < caret; i++) if (text[i] === '"') quotes++
  if (quotes % 2 === 1) return null
  // 直後に名前の続きや括弧があるときは補完しない（すでに書いてある関数を壊さない）
  if (caret < text.length && (NAME_CHAR.test(text[caret]) || text[caret] === '(')) return null

  let start = caret
  while (start > 1 && NAME_CHAR.test(text[start - 1])) start--
  const prefix = text.slice(start, caret)
  if (!/^[A-Za-z]/.test(prefix)) return null
  // 名前の前は演算子・括弧・区切り・先頭の = のどれか（Sheet1!A1 の A などは除く）
  const before = text[start - 1]
  if (!/[=+\-*/^(,;:<>&\s]/.test(before)) return null
  return { start, prefix }
}

/**
 * 打ちかけの名前に前方一致する関数。説明のある主な関数を先に、あとは名前順。
 */
export function suggestFunctions(prefix: string, names: readonly string[], limit = 8): string[] {
  const upper = prefix.toUpperCase()
  const hits = names.filter((name) => name.startsWith(upper))
  hits.sort((a, b) => {
    const known = Number(CATALOG_BY_NAME.has(b)) - Number(CATALOG_BY_NAME.has(a))
    if (known !== 0) return known
    // 完全一致・短い名前を先に
    return a.length - b.length || a.localeCompare(b)
  })
  return hits.slice(0, limit)
}

/**
 * キャレットがどの関数の何番目の引数の中にあるか（引数のヒント用）。
 * 一番内側の閉じていない括弧の前にある関数名と、そこまでの区切りの数を返す。
 */
export function activeCall(text: string, caret: number): { name: string; argIndex: number } | null {
  if (!text.startsWith('=')) return null
  const stack: Array<{ name: string; args: number }> = []
  let inString = false
  for (let i = 1; i < Math.min(caret, text.length); i++) {
    const ch = text[i]
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '(') {
      let start = i
      while (start > 1 && NAME_CHAR.test(text[start - 1])) start--
      stack.push({ name: text.slice(start, i).toUpperCase(), args: 0 })
    } else if (ch === ')') {
      stack.pop()
    } else if (ch === ',' && stack.length > 0) {
      stack[stack.length - 1].args++
    }
  }
  const top = stack[stack.length - 1]
  if (!top || !top.name) return null
  return { name: top.name, argIndex: top.args }
}

/** 候補を確定したときのテキストとキャレット（名前のあとに "(" を付ける） */
export function applySuggestion(
  text: string,
  start: number,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const head = text.slice(0, start) + name + '('
  return { text: head + text.slice(caret), caret: head.length }
}

/** 引数ヒントで何番目を強調するか。"..." 以降は最後の名前つき引数の繰り返し */
export function highlightedArg(info: FunctionInfo, argIndex: number): number {
  const ellipsis = info.args.indexOf('...')
  if (ellipsis < 0) return Math.min(argIndex, info.args.length - 1)
  if (argIndex < ellipsis) return argIndex
  return ellipsis - 1
}
