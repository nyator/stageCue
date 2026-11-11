import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {} }))
const { userLibraryFromConfig } = await import('./ableton-device')

describe('userLibraryFromConfig', () => {
  it('reads the User Library location from Live’s Library.cfg', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton>
	<ContentLibrary>
		<UserLibrary>
			<LibraryProject Id="0">
				<ProjectLocation />
				<ProjectName Value="User Library" />
				<ProjectPath Value="/Users/sam/Music/Ableton" />
			</LibraryProject>
		</UserLibrary>
	</ContentLibrary>
</Ableton>`
    expect(userLibraryFromConfig(xml)).toBe(path.join('/Users/sam/Music/Ableton', 'User Library'))
  })

  it('returns null when the file has no User Library', () => {
    expect(userLibraryFromConfig('<Ableton><ContentLibrary /></Ableton>')).toBeNull()
  })
})
