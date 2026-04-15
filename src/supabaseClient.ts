import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ulnegfyepsnrdvwdqodc.supabase.co'
const supabaseKey = 'sb_publishable_zM0UFHQOHQlUHUn66z4jHg_s5jBpehl'

export const supabase = createClient(supabaseUrl, supabaseKey)