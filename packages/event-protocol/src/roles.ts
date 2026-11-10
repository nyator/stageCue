import { z } from 'zod'

export const clientRoleSchema = z.enum(['desktop', 'display', 'daw_bridge'])
export type ClientRole = z.infer<typeof clientRoleSchema>
