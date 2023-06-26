import * as vscode from 'vscode';

import { clValidSymbolSingleCharColonSet } from '../../common/cl_util';
import type { ScanDocRes } from '../ScanDocRes';
import { SymbolInfo } from '../SymbolInfo';
import { findMatchPairExactP, addToDictArr, checkDefName, isRangeIntExcludedRanges, isSpace } from '../collect_util';

import { processVars } from './lambda_list';

function getStepFormArr(vars: Map<string, [number, number]>, varsStr: string, baseInd: number, scanDocRes: ScanDocRes) {
  // {name, validScope}
  const res: [number, number][] = [];

  for (const rang of vars.values()) {
    const end = rang[1] - baseInd;
    const stepForm = getStepFormRange(end, baseInd, varsStr, scanDocRes);
    if (stepForm !== undefined) {
      res.push(stepForm);
    }
  }

  return res;
}

function getStepFormRange(
  i: number, baseInd: number, varsStr: string, scanDocRes: ScanDocRes,
): [number, number] | undefined {

  let varName = '';
  let varStart = -1;

  // (var [init-form [step-form]]) total 2 items
  //     ^ from here
  let countItem = 0;
  const upper = varsStr.length;
  while (i < upper) {
    if (varsStr[i] === ';') {
      while (i < upper && varsStr[i] !== '\n') {
        ++i;
      }

    } else if (varsStr[i] === '|' && varsStr[i - 1] === '#') {
      while (i < upper && (varsStr[i] !== '#' || varsStr[i - 1] !== '|')) {
        ++i;
      }

    } else if (clValidSymbolSingleCharColonSet.has(varsStr[i])) {
      if (varStart === -1) {
        varStart = i;
      }
      varName += varsStr[i];
      ++i;

    } else if (varsStr[i] === '(') {
      if (countItem === 0) {
        const idx = findMatchPairExactP(baseInd + i, scanDocRes.pairMap);
        if (idx === -1) {
          return undefined;
        }
        const newInd = idx - baseInd;
        i = newInd;
        countItem = 1;
      } else if (countItem === 1) {
        const idx = findMatchPairExactP(baseInd + i, scanDocRes.pairMap);
        if (idx === -1) {
          return undefined;
        } else {
          return [baseInd + i, idx];
        }
      } else {
        return undefined;
      }

    } else if (isSpace(varsStr[i]) || varsStr[i] === ')') {
      // cannot find match anymore
      if (countItem === 0) {
        if (varName && varStart !== -1 &&
          varName !== '.' &&
          !varName.includes(':') &&
          !varName.startsWith('&')
        ) {
          countItem = 1;
        }
      } else {
        return undefined;
      }

      varStart = -1;
      varName = '';
      ++i;
    } else {
      ++i;
    }
  }
  return undefined;
}


function collectKeywordVars(
  document: vscode.TextDocument, scanDocRes: ScanDocRes, excludedRange: [number, number][]
): [Map<string, SymbolInfo[]>, [number, number][]] {
  const uri = document.uri;
  const text = scanDocRes.text;
  const defLocalNames: Map<string, SymbolInfo[]> = new Map<string, SymbolInfo[]>();
  const stepForm: [number, number][] = [];

  // commonlisp.yaml special-operator | macro
  // `progv` allows binding one or more dynamic variables, is not implemented
  const matchRes1 = text.matchAll(/(?<=#'|\s|^)(\()(\s*)(lambda|let\*|let|symbol-macrolet|do\*|do|prog\*|prog|multiple-value-bind|destructuring-bind)\s+?(\()/igmd);

  for (const r of matchRes1) {
    if (r.indices === undefined) {
      continue;
    }

    // working in currtext
    const closedParenthese = findMatchPairExactP(r.indices[1][0], scanDocRes.pairMap);
    if (closedParenthese === -1) {
      continue;
    }

    const leftPInd = r.indices[4][0];

    // get vars list, start with `(`
    let isLambdaList = false;
    let allowDestructuring = false;
    if (r[3] === 'lambda') {
      isLambdaList = true;
    } else if (r[3] === 'destructuring-bind') {
      isLambdaList = true;
      allowDestructuring = true;
    } else { }

    const varsRes = processVars(leftPInd, isLambdaList, allowDestructuring, scanDocRes, closedParenthese);
    if (varsRes === undefined) {
      continue;
    }

    const [vars, varsStrEnd] = varsRes;

    if (r[3] === 'do') {
      // http://www.lispworks.com/documentation/lw60/CLHS/Body/m_do_do.htm step-form
      stepForm.push(...getStepFormArr(vars, text.substring(leftPInd, varsStrEnd), leftPInd, scanDocRes));
    }

    if (r[3] === 'let*' || r[3] === 'do*' || r[3] === 'prog*') {
      // get lexical scope
      // only for let* | do* | progn, sequencial binding
      for (const [nn, rang] of vars) {
        if (isRangeIntExcludedRanges(rang, excludedRange)) {
          continue;
        }

        const range = new vscode.Range(
          document.positionAt(rang[0]),
          document.positionAt(rang[1]),
        );

        const lexicalScope: [number, number] = [rang[1] + 1, closedParenthese];

        addToDictArr(defLocalNames, nn.toLowerCase(), new SymbolInfo(
          nn.toLowerCase(), r[3].toLowerCase(), lexicalScope,
          new vscode.Location(uri, range), vscode.SymbolKind.Variable, rang
        ));
      }
    } else {
      // get lexical scope
      // lexical scope valid after definition, that is, after next '()' pair
      const startValidPos = findMatchPairExactP(leftPInd, scanDocRes.pairMap, closedParenthese);
      if (startValidPos === -1) {
        continue;
      }
      const lexicalScope: [number, number] = [startValidPos, closedParenthese];

      for (const [nn, rang] of vars) {
        if (isRangeIntExcludedRanges(rang, excludedRange)) {
          continue;
        }
        const range = new vscode.Range(
          document.positionAt(rang[0]),
          document.positionAt(rang[1]),
        );

        addToDictArr(defLocalNames, nn.toLowerCase(), new SymbolInfo(
          nn.toLowerCase(), r[3].toLowerCase(), lexicalScope,
          new vscode.Location(uri, range), vscode.SymbolKind.Variable, rang
        ));
      }
    }

  }
  //console.log(defLocalNames);
  return [defLocalNames, stepForm];
}

function collectKeywordSingleVar(
  document: vscode.TextDocument, scanDocRes: ScanDocRes, excludedRange: [number, number][]
): Map<string, SymbolInfo[]> {
  const uri = document.uri;
  const text = scanDocRes.text;
  const defLocalNames: Map<string, SymbolInfo[]> = new Map<string, SymbolInfo[]>();

  // commonlisp.yaml macro
  const matchRes2 = text.matchAll(/(?<=#'|\s|^)(\()(\s*)(do-symbols|do-external-symbols|do-all-symbols|dolist|dotimes|pprint-logical-block|with-input-from-string|with-open-file|with-open-stream|with-output-to-string|with-package-iterator|with-hash-table-iterator)\s+?(\()\s*?([#:A-Za-z0-9\+\-\*\/\@\$\%\^\&\_\=\<\>\~\!\?\[\]\{\}\.]+)(\s|\)|\()/igmd);

  for (const r of matchRes2) {
    if (r.indices === undefined) {
      continue;
    }

    const defLocalName = checkDefName(r, [5]);
    if (defLocalName === undefined) {
      continue;
    }

    const nameRangeInd = r.indices[5];
    if (isRangeIntExcludedRanges(nameRangeInd, excludedRange)) {
      continue;
    }

    // console.log(`${defLocalName}: Range`);

    // working in currtext
    const closedParenthese = findMatchPairExactP(r.indices[1][0], scanDocRes.pairMap);
    if (closedParenthese === -1) {
      continue;
    }

    const startValidPos = findMatchPairExactP(r.indices[4][0], scanDocRes.pairMap, closedParenthese);
    if (startValidPos === -1) {
      continue;
    }
    // console.log(`${defLocalName}: ${startValidPos} -> ${closedParenthese}`);
    const lexicalScope: [number, number] = [startValidPos, closedParenthese];

    const range = new vscode.Range(
      document.positionAt(nameRangeInd[0]),
      document.positionAt(nameRangeInd[1]),
    );

    addToDictArr(defLocalNames, defLocalName.toLowerCase(), new SymbolInfo(
      defLocalName.toLowerCase(), r[3].toLowerCase(), lexicalScope,
      new vscode.Location(uri, range), vscode.SymbolKind.Variable, nameRangeInd
    ));

  }
  return defLocalNames;
}


export { collectKeywordVars, collectKeywordSingleVar };