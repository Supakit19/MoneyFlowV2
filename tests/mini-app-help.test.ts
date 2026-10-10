import { describe, expect, test } from 'bun:test';
import { simpleHelpCard } from '../server/line-flex.ts';

type FlexNode = {
  type?: string;
  action?: { type?: string; label?: string; uri?: string };
  contents?: FlexNode[];
  body?: FlexNode;
  footer?: FlexNode;
  header?: FlexNode;
};
function allActions(root: FlexNode): NonNullable<FlexNode['action']>[] {
  const actions: NonNullable<FlexNode['action']>[] = [];
  function walk(node: FlexNode) {
    if (node.action) actions.push(node.action);
    for (const x of node.contents || []) walk(x);
    if (node.body) walk(node.body);
    if (node.footer) walk(node.footer);
    if (node.header) walk(node.header);
  }
  walk(root);
  return actions;
}

describe('A friendly shortcut from LINE conversation to MoneyFlow personal mini app', () => {
  test('default help card preserves working text commands when LIFF is not configured', () => {
    const result = simpleHelpCard();
    expect(result.type).toBe('flex');
    const actions = allActions(result.contents);
    expect(actions.every((a) => a.type === 'message')).toBe(true);
  });
  test('verified LIFF configuration adds a real open-app URI action', () => {
    const url = 'https://liff.line.me/1234567890-AbcdEF12';
    const result = simpleHelpCard(url);
    const actions = allActions(result.contents);
    expect(actions.find((a) => a.type === 'uri')).toEqual({
      type: 'uri',
      label: 'เปิดสมุดเงินของฉัน',
      uri: url,
    });
    expect(result.quickReply?.items?.length).toBeGreaterThan(0);
  });
});
