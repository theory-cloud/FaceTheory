<script lang="ts">
  import type {
    PackageSourceInput,
    PackageSourceInputError,
    PackageSourceInputErrorKind,
    PackageSourceInputFileMeta,
    PackageSourceInputMode,
    PackageSourceInputState,
  } from './types.js';

  export let input: PackageSourceInput;
  export let onValueChange: ((next: string) => void) | undefined = undefined;
  export let onFiles: ((files: PackageSourceInputFileMeta[]) => void) | undefined = undefined;
  export let onClear: (() => void) | undefined = undefined;
  export let onReplace: (() => void) | undefined = undefined;
  export let onCopy: ((copyValue: string) => void) | undefined = undefined;

  const STATE_LABEL_DEFAULTS: Record<PackageSourceInputState, string> = {
    idle: 'Awaiting source',
    loading: 'Loading source',
    validating: 'Validating source',
    ready: 'Ready for server preview',
    invalid: 'Invalid source',
    forbidden: 'Source not allowed',
    redacted: 'Source contains redacted content',
  };

  const ERROR_KIND_LABEL: Record<PackageSourceInputErrorKind, string> = {
    'invalid-syntax': 'Invalid syntax',
    forbidden: 'Forbidden',
    redacted: 'Redacted',
    unsafe: 'Unsafe',
    other: 'Error',
  };

  function isAlertState(state: PackageSourceInputState): boolean {
    return state === 'invalid' || state === 'forbidden' || state === 'redacted';
  }
  function isStatusState(state: PackageSourceInputState): boolean {
    return state === 'loading' || state === 'validating' || state === 'ready';
  }
  function stateLabel(state: PackageSourceInputState): string {
    if (input.stateLabels !== undefined && input.stateLabels[state] !== undefined) {
      return input.stateLabels[state] as string;
    }
    return STATE_LABEL_DEFAULTS[state];
  }

  function handlePaste(event: Event): void {
    if (onValueChange === undefined) return;
    onValueChange((event.target as HTMLTextAreaElement).value);
  }

  function metaFromFileList(files: FileList | null): PackageSourceInputFileMeta[] {
    const out: PackageSourceInputFileMeta[] = [];
    if (files === null) return out;
    for (let i = 0; i < files.length; i += 1) {
      const file = files.item(i);
      if (file === null) continue;
      const entry: PackageSourceInputFileMeta = { name: file.name, sizeBytes: file.size };
      if (file.type) entry.mediaType = file.type;
      out.push(entry);
    }
    return out;
  }

  function handleFileChange(event: Event): void {
    if (onFiles === undefined) return;
    onFiles(metaFromFileList((event.target as HTMLInputElement).files));
  }

  function handleDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    if (onFiles === undefined) return;
    onFiles(metaFromFileList(event.dataTransfer?.files ?? null));
  }

  function handleCopy(value: string): void {
    if (onCopy !== undefined) onCopy(value);
  }

  $: labelId = input.label !== undefined ? `${input.groupId}-label` : undefined;
  $: descriptionId = input.description !== undefined ? `${input.groupId}-description` : undefined;
  $: stateAnnouncementId = `${input.groupId}-state`;
  $: errorIds = input.errors.map((e) => `${input.groupId}-error-${e.id}`);
  $: ariaDescribedBy =
    [descriptionId, stateAnnouncementId, ...errorIds]
      .filter((id): id is string => typeof id === 'string')
      .join(' ') || undefined;
  $: allowPaste = (input.modes as PackageSourceInputMode[]).includes('paste');
  $: allowUpload = (input.modes as PackageSourceInputMode[]).includes('upload');
  $: allowDropzone = (input.modes as PackageSourceInputMode[]).includes('dropzone');
  $: announceLabel = stateLabel(input.state);
  $: stateRole = isAlertState(input.state)
    ? 'alert'
    : isStatusState(input.state)
      ? 'status'
      : undefined;
</script>

<section
  class={`facetheory-stitch-package-source-input facetheory-stitch-package-source-input-state-${input.state}`}
  data-safety-policy={input.safetyPolicy}
  data-group-id={input.groupId}
  data-state={input.state}
  data-modes={input.modes.join(' ')}
  data-error-count={String(input.errors.length)}
  data-has-file={input.fileMeta !== undefined ? 'true' : 'false'}
>
  {#if input.label !== undefined || input.description !== undefined}
    <header>
      {#if input.label !== undefined}
        <label id={labelId} for={allowPaste ? `${input.groupId}-paste` : undefined}>
          {input.label}
        </label>
      {/if}
      {#if input.description !== undefined}
        <p id={descriptionId}>{input.description}</p>
      {/if}
    </header>
  {/if}

  {#if allowPaste}
    <textarea
      id={`${input.groupId}-paste`}
      class="facetheory-stitch-package-source-input-paste"
      data-mode="paste"
      value={input.value}
      placeholder={input.placeholder}
      aria-labelledby={labelId}
      aria-describedby={ariaDescribedBy}
      aria-invalid={isAlertState(input.state) ? 'true' : 'false'}
      on:input={handlePaste}
    ></textarea>
  {/if}

  {#if allowDropzone}
    <div
      role="group"
      class={`facetheory-stitch-package-source-input-dropzone facetheory-stitch-package-source-input-dropzone-state-${input.state}`}
      data-mode="dropzone"
      data-dropzone-state={input.state}
      aria-label={announceLabel}
      aria-describedby={ariaDescribedBy}
      aria-disabled={input.state === 'loading' ? 'true' : undefined}
      tabindex="0"
      on:dragover={handleDragOver}
      on:drop={handleDrop}
    >
      <strong>Drop files here or use the picker</strong>
      <span>Files are parsed by TheoryMCP, not by FaceTheory.</span>
    </div>
  {/if}

  {#if allowUpload}
    <div class="facetheory-stitch-package-source-input-upload" data-mode="upload">
      <label for={`${input.groupId}-file`}>Choose a file:</label>
      <input
        id={`${input.groupId}-file`}
        type="file"
        class="facetheory-stitch-package-source-input-file"
        accept={input.fileAccept}
        aria-describedby={ariaDescribedBy}
        on:change={handleFileChange}
      />
    </div>
  {/if}

  {#if input.fileMeta !== undefined}
    <dl
      class="facetheory-stitch-package-source-input-file-meta"
      data-file-name={input.fileMeta.name}
    >
      <div><dt>File</dt><dd>{input.fileMeta.name}</dd></div>
      {#if input.fileMeta.sizeBytes !== undefined}
        <div><dt>Size</dt><dd>{input.fileMeta.sizeBytes} B</dd></div>
      {/if}
      {#if input.fileMeta.mediaType !== undefined}
        <div><dt>Media type</dt><dd>{input.fileMeta.mediaType}</dd></div>
      {/if}
      {#if input.fileMeta.sha256 !== undefined}
        <div><dt>sha256</dt><dd><code>{input.fileMeta.sha256}</code></dd></div>
      {/if}
    </dl>
  {/if}

  <p
    id={stateAnnouncementId}
    class={`facetheory-stitch-package-source-input-state facetheory-stitch-package-source-input-state-label-${input.state}`}
    data-state-label={input.state}
    role={stateRole}
    aria-live={stateRole === 'status' ? 'polite' : undefined}
  >{announceLabel}</p>

  {#if input.errors.length > 0}
    <ul
      class="facetheory-stitch-package-source-input-errors"
      role="list"
      data-error-count={String(input.errors.length)}
    >
      {#each input.errors as error (error.id)}
        <li
          id={`${input.groupId}-error-${error.id}`}
          class={`facetheory-stitch-package-source-input-error facetheory-stitch-package-source-input-error-${error.kind}`}
          data-error-kind={error.kind}
          data-error-id={error.id}
          role="alert"
          aria-live="polite"
        >
          <strong
            class="facetheory-stitch-package-source-input-error-kind"
            data-error-kind-label={error.kind}
          >{ERROR_KIND_LABEL[error.kind]}</strong>
          <span class="facetheory-stitch-package-source-input-error-message">{error.message}</span>
          {#if error.evidence !== undefined && error.kind !== 'redacted'}
            <code class="facetheory-stitch-package-source-input-error-evidence">{error.evidence}</code>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if input.actions !== undefined && (input.actions.clear === true || input.actions.replace === true || (input.actions.copy === true && input.actions.copyValue !== undefined))}
    <div class="facetheory-stitch-package-source-input-actions">
      {#if input.actions.clear === true}
        <button
          type="button"
          class="facetheory-stitch-package-source-input-action facetheory-stitch-package-source-input-action-clear"
          data-action="clear"
          aria-label="Clear package source"
          on:click={() => onClear?.()}
        >Clear</button>
      {/if}
      {#if input.actions.replace === true}
        <button
          type="button"
          class="facetheory-stitch-package-source-input-action facetheory-stitch-package-source-input-action-replace"
          data-action="replace"
          aria-label="Replace package source"
          on:click={() => onReplace?.()}
        >Replace</button>
      {/if}
      {#if input.actions.copy === true && input.actions.copyValue !== undefined}
        {@const copyValue = input.actions.copyValue}
        <button
          type="button"
          class="facetheory-stitch-package-source-input-action facetheory-stitch-package-source-input-action-copy"
          data-action="copy"
          data-copy-value={copyValue}
          aria-label="Copy package source"
          on:click={() => handleCopy(copyValue)}
        >Copy</button>
      {/if}
    </div>
  {/if}

  <p
    class="facetheory-stitch-wizard-safety-footnote"
    data-safety-policy={input.safetyPolicy}
  >Safety policy: {input.safetyPolicy}</p>
</section>
