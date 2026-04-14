import { defineComponent, h } from 'vue';
import type { PropType } from 'vue';

import {
  renderDefaultSlot,
  renderPropContent,
  vnodeChildProp,
} from '../stitch-common.js';

export const PasskeyCTA = defineComponent({
  name: 'FaceTheoryVuePasskeyCTA',
  props: {
    loading: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    onClick: {
      type: Function as PropType<((event: MouseEvent) => void) | undefined>,
      required: false,
    },
    icon: vnodeChildProp,
    type: {
      type: String as () => 'button' | 'submit',
      default: 'button',
    },
  },
  setup(props, { slots }) {
    return () =>
      h(
        'button',
        {
          type: props.type,
          class: 'facetheory-stitch-passkey-cta',
          disabled: props.disabled || props.loading,
          'aria-busy': props.loading ? 'true' : undefined,
          onClick: props.onClick,
          style: {
            width: '100%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            background:
              'linear-gradient(135deg, var(--stitch-color-primary, #1f108e) 0%, var(--stitch-color-primary-container, #3730a3) 100%)',
            border: 'none',
            borderRadius: '9999px',
            height: '48px',
            fontWeight: 600,
            fontSize: '15px',
            color: '#ffffff',
            cursor: props.disabled || props.loading ? 'default' : 'pointer',
          },
        },
        [
          props.icon !== undefined ? renderPropContent(props.icon) : null,
          props.loading ? 'Loading…' : renderDefaultSlot(slots),
        ],
      );
  },
});
