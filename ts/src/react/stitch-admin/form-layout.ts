import * as React from 'react';

const h = React.createElement;

export interface FormRowProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  /** Mark the row as required (appends a subtle indicator to the label). */
  required?: boolean;
  /** Validation error message displayed below the control. */
  error?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Single row inside a SplitForm. The label + description sit in the left
 * column and the control stacks vertically in the right column. Use this
 * instead of AntD's `Form.Item` when you want dense label-left layouts.
 */
export function FormRow(props: FormRowProps): React.ReactElement {
  const { label, description, required, error, children } = props;
  return h(
    'div',
    {
      className: 'facetheory-stitch-form-row',
      style: {
        display: 'grid',
        gridTemplateColumns: 'minmax(200px, 280px) 1fr',
        columnGap: '32px',
        rowGap: '8px',
        alignItems: 'start',
      },
    },
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
      h(
        'span',
        {
          style: {
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--stitch-color-on-surface, #131b2e)',
          },
        },
        label,
        required
          ? h(
              'span',
              {
                'aria-hidden': 'true',
                style: {
                  color: 'var(--stitch-color-error, #ba1a1a)',
                  marginLeft: 4,
                },
              },
              '*',
            )
          : null,
      ),
      description !== undefined
        ? h(
            'span',
            {
              style: {
                fontSize: '12px',
                color: 'var(--stitch-color-on-surface-variant, #464553)',
                lineHeight: 1.5,
              },
            },
            description,
          )
        : null,
    ),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      children,
      error !== undefined
        ? h(
            'span',
            {
              role: 'alert',
              style: {
                fontSize: '12px',
                color: 'var(--stitch-color-error, #ba1a1a)',
              },
            },
            error,
          )
        : null,
    ),
  );
}

export interface SplitFormProps {
  children: React.ReactNode;
}

/**
 * Vertical stack of FormRows. Groups rows with consistent spacing and
 * lets consumers compose settings pages without wiring a Form component.
 */
export function SplitForm(props: SplitFormProps): React.ReactElement {
  return h(
    'div',
    {
      className: 'facetheory-stitch-split-form',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
      },
    },
    props.children,
  );
}

export interface FormSectionProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Grouping heading inside a SplitForm — used to section related rows.
 */
export function FormSection(props: FormSectionProps): React.ReactElement {
  const { title, description, children } = props;
  return h(
    'div',
    {
      className: 'facetheory-stitch-form-section',
      style: { display: 'flex', flexDirection: 'column', gap: '16px' },
    },
    title !== undefined || description !== undefined
      ? h(
          'header',
          {
            style: { display: 'flex', flexDirection: 'column', gap: '4px' },
          },
          title !== undefined
            ? h(
                'h3',
                {
                  style: {
                    margin: 0,
                    fontSize: '15px',
                    color: 'var(--stitch-color-on-surface, #131b2e)',
                  },
                },
                title,
              )
            : null,
          description !== undefined
            ? h(
                'p',
                {
                  style: {
                    margin: 0,
                    fontSize: '13px',
                    color: 'var(--stitch-color-on-surface-variant, #464553)',
                  },
                },
                description,
              )
            : null,
        )
      : null,
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '24px' } }, children),
  );
}
