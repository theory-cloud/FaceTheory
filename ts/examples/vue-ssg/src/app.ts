import { defineComponent, h } from 'vue';

export interface SsgLink {
  href: string;
  label: string;
}

export interface VueSsgAppProps {
  heading: string;
  lede: string;
  links: SsgLink[];
}

export const App = defineComponent({
  name: 'FaceTheoryVueSsgApp',
  props: {
    heading: { type: String, required: true },
    lede: { type: String, required: true },
    links: { type: Array as () => SsgLink[], required: true },
  },
  setup(props: VueSsgAppProps) {
    return () =>
      h('main', { class: 'vue-ssg' }, [
        h('h1', null, props.heading),
        h('p', { class: 'vue-ssg-lede' }, props.lede),
        h(
          'ul',
          { class: 'vue-ssg-links' },
          props.links.map((link) =>
            h('li', { key: link.href }, [h('a', { href: link.href }, link.label)]),
          ),
        ),
      ]);
  },
});
