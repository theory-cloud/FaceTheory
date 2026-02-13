import { defineComponent, h } from 'vue';

export interface AppProps {
  message: string;
}

export const App = defineComponent({
  name: 'FaceTheoryVueExampleApp',
  props: {
    message: {
      type: String,
      required: true,
    },
  },
  setup(props: AppProps) {
    return () =>
      h(
        'main',
        { class: 'vue-inline vue-app' },
        [
          h('h1', null, 'Vue SSR Example'),
          h('p', null, `Hello ${props.message}`),
        ],
      );
  },
});
