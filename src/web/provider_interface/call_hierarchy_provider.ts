import * as vscode from 'vscode';

import type { CallHrchyInfo } from '../builders/call_hierarchy_builder/CallHrchyInfo';
import type { DocSymbolInfo } from '../collect_user_symbol/DocSymbolInfo';
import { clValidWithColonSharp, CL_MODE } from '../common/cl_util';
import { TriggerProvider } from '../common/enum';

import { TriggerEvent } from './TriggerEvent';
import { structuredInfo } from './structured_info';

function getCallHierarchyCallsByCallHierarchyItem(
  item: vscode.CallHierarchyItem,
  callHierarchyCallsDict: Record<string, Record<string, vscode.CallHierarchyOutgoingCall>>): vscode.CallHierarchyOutgoingCall[];
function getCallHierarchyCallsByCallHierarchyItem(
  item: vscode.CallHierarchyItem,
  callHierarchyCallsDict: Record<string, Record<string, vscode.CallHierarchyIncomingCall>>): vscode.CallHierarchyIncomingCall[];
function getCallHierarchyCallsByCallHierarchyItem(
  item: vscode.CallHierarchyItem,
  callHierarchyCallsDict: Record<string, Record<string, vscode.CallHierarchyIncomingCall | vscode.CallHierarchyOutgoingCall>>):
  (vscode.CallHierarchyIncomingCall | vscode.CallHierarchyOutgoingCall)[] {

  const callHierarchyItemStr = `${item.name}|${item.uri.path}|${item.range.start.line},${item.range.start.character},${item.range.end.line},${item.range.end.character}`;
  const callHierarchyCallDict = callHierarchyCallsDict[item.name];
  if (!callHierarchyCallDict) {
    return [];
  }
  const res = callHierarchyCallDict[callHierarchyItemStr];
  return res ? [res] : [];
}

function getCallHrchyItems(
  currDocSymbolInfo: DocSymbolInfo, range: vscode.Range, currCallHierarchyInfo: CallHrchyInfo
): vscode.CallHierarchyItem | vscode.CallHierarchyItem[] {

  const word = currDocSymbolInfo.document.getText(range);
  const queryStr = `${word}|${currDocSymbolInfo.document.uri.path}|${range.start.line},${range.start.character},${range.end.line},${range.end.character}`;

  const itemD = currCallHierarchyInfo.callHrchyItems[word];
  if (!itemD) {
    return [];
  }
  const res = itemD[queryStr];
  return res ? res : [];
}

function registerCallHierarchyProvider() {

  const callHierarchyProvider = vscode.languages.registerCallHierarchyProvider(
    CL_MODE,
    {
      prepareCallHierarchy(document, position, token) {
        const range = document.getWordRangeAtPosition(position, clValidWithColonSharp);
        if (!range) {
          return undefined;
        }

        structuredInfo.produceInfoByDoc(document, new TriggerEvent(TriggerProvider.prepareCallHierarchy));
        if (!structuredInfo.currDocSymbolInfo || !structuredInfo.currCallHierarchyInfo) {
          return undefined;
        }

        const res = getCallHrchyItems(structuredInfo.currDocSymbolInfo, range, structuredInfo.currCallHierarchyInfo);
        return res;
      },

      provideCallHierarchyIncomingCalls(item, token) {
        if (!structuredInfo.currCallHierarchyInfo) {
          return undefined;
        }

        const res = getCallHierarchyCallsByCallHierarchyItem(item, structuredInfo.currCallHierarchyInfo.incomingCall);
        return res;
      },
      provideCallHierarchyOutgoingCalls(item, token) {
        if (!structuredInfo.currCallHierarchyInfo) {
          return undefined;
        }

        const res = getCallHierarchyCallsByCallHierarchyItem(item, structuredInfo.currCallHierarchyInfo.outgoingCall);
        return res;
      }
    }
  );

  return callHierarchyProvider;
}

export { registerCallHierarchyProvider };
