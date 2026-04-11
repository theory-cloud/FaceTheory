/**
 * Semantic variants for Stitch status pills. These variants map to token-bound
 * backgrounds and foregrounds in each framework adapter so tenant theming can
 * restyle the badges without callers choosing raw colors.
 */
export type StatusVariant =
  | 'active'
  | 'pending'
  | 'suspended'
  | 'archived'
  | 'error'
  | 'warning'
  | 'allow'
  | 'deny';
