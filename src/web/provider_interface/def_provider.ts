import * as vscode from 'vscode';

import type { DocSymbolInfo } from '../collect_user_symbol/DocSymbolInfo';
import { isQuote, isRangeIntExcludedRanges } from '../collect_user_symbol/user_symbol_util';
import { CL_MODE, clValidWithColonSharp } from '../common/cl_util';
import { TriggerProvider } from '../common/enum';

import { TriggerEvent } from './TriggerEvent';
import { structuredInfo } from './structured_info';

function registerDefinitionProvider() {
  const definitionProvider = vscode.languages.registerDefinitionProvider(
    CL_MODE,
    {
      provideDefinition(document, position, token) {
        const range = document.getWordRangeAtPosition(position, clValidWithColonSharp);
        if (!range) {
          return undefined;
        }

        structuredInfo.produceInfoByDoc(document, new TriggerEvent(TriggerProvider.provideDefinition));
        if (!structuredInfo.currDocSymbolInfo) {
          return undefined;
        }

        const positionFlag = isQuote(document, position) ? undefined : position;
        return getSymbolLocByRange(
          structuredInfo.currDocSymbolInfo,
          range,
          positionFlag,
          structuredInfo.buildingConfig
        );
      }
    }
  );

  return definitionProvider;

}

// Common Lisp the Language, 2nd Edition
// 5.2.1. Named Functions https://www.cs.cmu.edu/Groups/AI/html/cltl/clm/node63.html#SECTION00921000000000000000
// set `position` to `undefined`, will only process global definition
function getSymbolLocByRange(
  currDocSymbolInfo: DocSymbolInfo,
  range: vscode.Range,
  positionFlag: vscode.Position | undefined,
  buildingConfig: Record<string, any>):
  vscode.Location | undefined {

  // config
  const excludedRanges = currDocSymbolInfo.docRes.getExcludedRangesWithBackQuote(buildingConfig);
  const doc = currDocSymbolInfo.document;
  const numRange: [number, number] = [doc.offsetAt(range.start), doc.offsetAt(range.end)];
  if (isRangeIntExcludedRanges(numRange, excludedRanges)) {
    return undefined;
  }
  const word = doc.getText(range).toLowerCase();
  if (!word) {
    return undefined;
  }
  const [symbolSelected, shadow] = currDocSymbolInfo.getSymbolWithShadowByRange(range, word, positionFlag);
  return symbolSelected?.loc;
}

export { registerDefinitionProvider };
