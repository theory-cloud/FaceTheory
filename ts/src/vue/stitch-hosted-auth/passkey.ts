import { defineComponent, h } from 'vue';
import type { PropType } from 'vue';

import { AUTH_SIGNATURE_GRADIENT_BACKGROUND } from '../../stitch-hosted-auth/index.js';
import type { AuthPasskeyButtonType } from '../../stitch-hosted-auth/index.js';

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
      type: String as () => AuthPasskeyButtonType,
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
            background: AUTH_SIGNATURE_GRADIENT_BACKGROUND,
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
