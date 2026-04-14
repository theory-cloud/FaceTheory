import type { PropType, Slots, VNodeChild } from 'vue';

export const vnodeChildProp = {
  type: null as unknown as PropType<VNodeChild>,
  required: false,
};

export function renderPropContent(value: VNodeChild | undefined): VNodeChild[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function renderDefaultSlot(slots: Slots): VNodeChild[] {
  return slots.default?.() ?? [];
}
