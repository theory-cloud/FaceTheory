<script lang="ts">
  import type {
    CodeDropzoneProps,
    PackageSourceInputError,
    PackageSourceInputErrorKind,
    PackageSourceInputFileMeta,
    PackageSourceInputState,
  } from './types.js';

  let {
    dropzone,
    onFiles = undefined,
  }: {
    dropzone?: CodeDropzoneProps;
    onFiles?: ((files: PackageSourceInputFileMeta[]) => void) | undefined;
  } = $props();

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
    if (dropzone.stateLabels !== undefined && dropzone.stateLabels[state] !== undefined) {
      return dropzone.stateLabels[state] as string;
    }
    return STATE_LABEL_DEFAULTS[state];
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

  function handleDragOver(event: DragEvent): void {
    event.preventDefault();
  }
  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    if (onFiles === undefined) return;
    onFiles(metaFromFileList(event.dataTransfer?.files ?? null));
  }

  const labelId = $derived(
    dropzone.label !== undefined ? `${dropzone.dropzoneId}-label` : undefined,
  );
  const descriptionId = $derived(
    dropzone.description !== undefined ? `${dropzone.dropzoneId}-description` : undefined,
  );
  const errorIds = $derived(
    (dropzone.errors ?? []).map((e: PackageSourceInputError) => `${dropzone.dropzoneId}-error-${e.id}`),
  );
  const ariaDescribedBy = $derived(
    [descriptionId, ...errorIds]
      .filter((id): id is string => typeof id === 'string')
      .join(' ') || undefined,
  );
  const announceLabel = $derived(stateLabel(dropzone.state));
  const stateRole = $derived(
    isAlertState(dropzone.state)
      ? 'alert'
      : isStatusState(dropzone.state)
        ? 'status'
        : undefined,
  );
</script>

<section
  id={dropzone.dropzoneId}
  class={`facetheory-stitch-code-dropzone facetheory-stitch-code-dropzone-state-${dropzone.state}`}
  data-safety-policy={dropzone.safetyPolicy}
  data-dropzone-id={dropzone.dropzoneId}
  data-state={dropzone.state}
  data-has-file={dropzone.fileMeta !== undefined ? 'true' : 'false'}
  role={stateRole}
  aria-labelledby={labelId}
  aria-describedby={ariaDescribedBy}
>
  {#if dropzone.label !== undefined}
    <div id={labelId}>{dropzone.label}</div>
  {/if}
  {#if dropzone.description !== undefined}
    <p id={descriptionId}>{dropzone.description}</p>
  {/if}

  <div
    role="group"
    class={`facetheory-stitch-code-dropzone-target facetheory-stitch-code-dropzone-target-state-${dropzone.state}`}
    data-dropzone-state={dropzone.state}
    aria-label={announceLabel}
    tabindex="0"
    ondragover={handleDragOver}
    ondrop={handleDrop}
  >
    <strong>{dropzone.emptyLabel ?? 'Drop files here'}</strong>
    <span>Files are parsed by TheoryMCP, not by FaceTheory.</span>
  </div>

  {#if dropzone.fileMeta !== undefined}
    <dl
      class="facetheory-stitch-package-source-input-file-meta"
      data-file-name={dropzone.fileMeta.name}
    >
      <div><dt>File</dt><dd>{dropzone.fileMeta.name}</dd></div>
      {#if dropzone.fileMeta.sizeBytes !== undefined}
        <div><dt>Size</dt><dd>{dropzone.fileMeta.sizeBytes} B</dd></div>
      {/if}
      {#if dropzone.fileMeta.mediaType !== undefined}
        <div><dt>Media type</dt><dd>{dropzone.fileMeta.mediaType}</dd></div>
      {/if}
      {#if dropzone.fileMeta.sha256 !== undefined}
        <div><dt>sha256</dt><dd><code>{dropzone.fileMeta.sha256}</code></dd></div>
      {/if}
    </dl>
  {/if}

  <p
    class={`facetheory-stitch-code-dropzone-state-label facetheory-stitch-code-dropzone-state-label-${dropzone.state}`}
    data-state-label={dropzone.state}
    role={stateRole}
    aria-live={stateRole === 'status' ? 'polite' : undefined}
  >{announceLabel}</p>

  {#if (dropzone.errors ?? []).length > 0}
    <ul class="facetheory-stitch-package-source-input-errors" role="list" data-error-count={String((dropzone.errors ?? []).length)}>
      {#each dropzone.errors ?? [] as error (error.id)}
        <li
          id={`${dropzone.dropzoneId}-error-${error.id}`}
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
          {#if error.evidence !== undefined && error.kind === 'invalid-syntax'}
            <code class="facetheory-stitch-package-source-input-error-evidence">{error.evidence}</code>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <p
    class="facetheory-stitch-wizard-safety-footnote"
    data-safety-policy={dropzone.safetyPolicy}
  >Safety policy: {dropzone.safetyPolicy}</p>
</section>
