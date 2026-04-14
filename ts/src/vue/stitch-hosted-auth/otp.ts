import { computed, defineComponent, h, ref } from 'vue';
import type { PropType } from 'vue';

function splitOtp(value: string, length: number): string[] {
  const chars = value.slice(0, length).split('');
  while (chars.length < length) chars.push('');
  return chars;
}

export const OTPInput = defineComponent({
  name: 'FaceTheoryVueOTPInput',
  props: {
    length: { type: Number, default: 6 },
    value: { type: String, required: false },
    onChange: {
      type: Function as PropType<((value: string) => void) | undefined>,
      required: false,
    },
    onComplete: {
      type: Function as PropType<((value: string) => void) | undefined>,
      required: false,
    },
    disabled: { type: Boolean, default: false },
    invalid: { type: Boolean, default: false },
    autoFocus: { type: Boolean, default: true },
  },
  setup(props) {
    const internalValue = ref(props.value ?? '');
    const renderedValue = computed(() => props.value ?? internalValue.value);

    function updateIndex(index: number, nextChar: string): void {
      const chars = splitOtp(renderedValue.value, props.length);
      chars[index] = nextChar.slice(-1);
      const nextValue = chars.join('').slice(0, props.length).trimEnd();
      internalValue.value = nextValue;
      props.onChange?.(nextValue);
      if (nextValue.length === props.length) props.onComplete?.(nextValue);
    }

    return () =>
      h(
        'div',
        {
          class: [
            'facetheory-stitch-otp-input',
            props.invalid ? 'facetheory-stitch-otp-input-invalid' : null,
          ]
            .filter(Boolean)
            .join(' '),
          style: {
            display: 'flex',
            gap: '8px',
          },
        },
        splitOtp(renderedValue.value, props.length).map((char, index) =>
          h('input', {
            key: index,
            value: char,
            maxlength: 1,
            inputmode: 'numeric',
            pattern: '[0-9]*',
            disabled: props.disabled,
            autofocus: props.autoFocus && index === 0 ? true : undefined,
            'aria-invalid': props.invalid ? 'true' : undefined,
            onInput: (event: Event) => {
              const target = event.target as HTMLInputElement;
              updateIndex(index, target.value);
            },
            style: {
              width: '44px',
              height: '48px',
              textAlign: 'center',
              borderRadius: 'var(--stitch-radius-md, 6px)',
              border: props.invalid
                ? '1px solid var(--stitch-color-error, #ba1a1a)'
                : '1px solid transparent',
              background: 'var(--stitch-color-surface-container-high, #e2e7ff)',
              fontSize: '18px',
              color: 'var(--stitch-color-on-surface, #131b2e)',
            },
          }),
        ),
      );
  },
});
