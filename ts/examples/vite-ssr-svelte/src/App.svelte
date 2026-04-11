<script lang="ts">
  import {
    PageFrame,
    Panel,
    Section,
    Shell,
    StatCard,
    SummaryStrip,
  } from '../../../src/svelte/stitch-shell/index.js';
  import {
    AuthCard,
    AuthFlowSection,
    AuthFlowStepper,
    AuthStateCard,
    ConsentItem,
    ConsentList,
    OTPInput,
    PasskeyCTA,
  } from '../../../src/svelte/stitch-hosted-auth/index.js';
  import {
    DataTable,
    DestructiveConfirm,
    DetailPanel,
    FormRow,
    FormSection,
    SplitForm,
    StatusTag,
  } from '../../../src/svelte/stitch-admin/index.js';

  export let message: string;

  const nav = [
    { key: '/dashboard', label: 'Dashboard', path: '/dashboard' },
    {
      key: 'partners-group',
      label: 'Partners',
      children: [
        { key: '/partners', label: 'All partners', path: '/partners' },
        { key: '/partners/new', label: 'New partner', path: '/partners/new' },
      ],
    },
  ];

  const partnerRows = [
    { key: '1', name: 'Acme Corp', status: 'active' },
    { key: '2', name: 'Globex', status: 'pending' },
  ];

  const partnerColumns = [
    { key: 'name', dataIndex: 'name', title: 'Name' },
    { key: 'status', dataIndex: 'status', title: 'Status' },
  ];
</script>

<Shell {nav} activeKey="/dashboard">
  <span slot="brand">Autheory</span>
  <span slot="topbarRight">Jane Doe</span>

  <PageFrame
    breadcrumbs={[
      { key: 'root', label: 'Home', path: '/' },
      { key: 'dashboard', label: 'Dashboard', path: '/dashboard' },
    ]}
    title="Svelte SSR Example"
    description={`Hello ${message}`}
  >
    <button slot="actions" type="button">Edit</button>

    <SummaryStrip>
      <StatCard label="Active users" value="1,204" delta={{ value: '+8%', trend: 'up' }} />
      <Panel>inside panel</Panel>
    </SummaryStrip>

    <Section title="Hosted auth" description="Passkey-first primitives">
      <AuthCard title="Sign in to Autheory" description="Use your passkey or password">
        <a slot="headerAction" href="/signup">Sign up</a>
        <a slot="footer" href="/reset">Trouble signing in?</a>

        <AuthFlowStepper
          steps={[
            { key: 'method', label: 'Method' },
            { key: 'verify', label: 'Verify' },
            { key: 'done', label: 'Done' },
          ]}
          currentIndex={1}
        />

        <AuthFlowSection
          eyebrow="Step 2 of 3"
          title="Confirm code"
          description="We sent a 6-digit code to your device"
        >
          <OTPInput length={6} invalid={true} />
          <PasskeyCTA>Continue with passkey</PasskeyCTA>
        </AuthFlowSection>

        <ConsentList>
          <ConsentItem
            label="Read your profile"
            description="Name, email, and tenant memberships"
          >
            <span slot="icon">◈</span>
          </ConsentItem>
          <ConsentItem label="Manage API clients" granted={true} />
        </ConsentList>

        <AuthStateCard
          variant="error"
          title="Account locked"
          description="Too many failed attempts"
        >
          <span slot="icon">!</span>
          <button slot="actions" type="button">Contact support</button>
        </AuthStateCard>
      </AuthCard>
    </Section>

    <Section title="Admin primitives" description="Dense control-plane surfaces">
      <DetailPanel
        title="Acme Corp"
        description="Tenant overview"
        properties={[
          { key: 'id', label: 'Tenant ID', value: 'acme-prod' },
          { key: 'plan', label: 'Plan', value: 'Enterprise' },
        ]}
      >
        <button slot="actions" type="button">Edit</button>
      </DetailPanel>

      <DataTable rowKey="key" dataSource={partnerRows} columns={partnerColumns}>
        <span slot="toolbar-left">2 partners</span>
        <input slot="toolbar-center" placeholder="Search" />
        <button slot="toolbar-right" type="button">New partner</button>
        <button slot="rowActions" let:record data-key={record.key} type="button">Edit</button>
      </DataTable>

      <SplitForm>
        <FormRow
          label="Email"
          description="The admin contact for this tenant"
          required={true}
          error="Email is required"
        >
          <input type="email" />
        </FormRow>
        <FormSection
          title="Authentication"
          description="Control how users sign in to this tenant"
        >
          <FormRow label="Allow passwords">
            <input type="checkbox" />
          </FormRow>
        </FormSection>
      </SplitForm>

      <div class="svelte-inline svelte-app">
        <StatusTag variant="active" label="Active · 12 members" />
        <DestructiveConfirm title="Delete tenant?" requireText="acme-prod" />
      </div>
    </Section>
  </PageFrame>
</Shell>
