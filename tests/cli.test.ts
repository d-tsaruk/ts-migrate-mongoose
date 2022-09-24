import fs from 'fs'
import colors from 'colors'
import mongoose, { Connection } from 'mongoose'
import { getMigrator, Migrate } from '../src/commander'
import { clearDirectory } from '../utils/filesystem'

colors.enable()

const exec = (...args: string[]) => {
  const migrate = new Migrate()
  process.argv = ['node', 'migrate', ...args]
  return migrate.run(false)
}

const execExit = (...args: string[]) => {
  const migrate = new Migrate()
  process.argv = ['node', 'migrate', ...args]
  return migrate.run(true)
}

describe('cli', () => {
  const uri = `${globalThis.__MONGO_URI__}${globalThis.__MONGO_DB_NAME__}`
  let connection: Connection

  beforeAll(async () => {
    clearDirectory('migrations')
    connection = await mongoose.createConnection(uri).asPromise()
  })

  afterAll(async () => {
    if (connection.readyState !== 0) {
      await connection.close()
    }
  })

  it('should get migrator instance', async () => {
    const migrator = await getMigrator({ uri })
    const connection = await migrator.connected()
    expect(migrator).toBeDefined()
    expect(connection).toBeDefined()
    expect(connection.readyState).toBe(1)
    await migrator.close()
    expect(connection.readyState).toBe(0)
  })

  it('should run list command', async () => {
    const consoleSpy = jest.spyOn(console, 'log')
    const opts = await exec('list', '-d', uri)
    expect(opts?.configPath).toBe('migrate')
    expect(opts?.uri).toBe(uri)
    expect(opts?.collection).toBe('migrations')
    expect(opts?.autosync).toBe(false)
    expect(opts?.migrationsPath).toBe('./migrations')
    expect(consoleSpy).toBeCalledWith('Listing migrations'.cyan)
    expect(consoleSpy).toBeCalledWith('There are no migrations to list'.yellow)
  })

  it('should run create command', async () => {
    const consoleSpy = jest.spyOn(console, 'log')
    const opts = await exec('create', 'migration-name-test', '-d', uri)
    expect(opts?.configPath).toBe('migrate')
    expect(opts?.uri).toBe(uri)
    expect(opts?.collection).toBe('migrations')
    expect(opts?.autosync).toBe(false)
    expect(opts?.migrationsPath).toBe('./migrations')
    expect(consoleSpy).toBeCalledWith(expect.stringMatching(/^Created migration migration-name-test in/))
    expect(consoleSpy).toBeCalledWith(expect.stringMatching(/^Migration created/))
  })

  it('should run up command', async () => {
    const consoleSpy = jest.spyOn(console, 'log')
    const opts = await exec('up', '-d', uri)
    expect(opts?.configPath).toBe('migrate')
    expect(opts?.uri).toBe(uri)
    expect(opts?.collection).toBe('migrations')
    expect(opts?.autosync).toBe(false)
    expect(opts?.migrationsPath).toBe('./migrations')
    expect(consoleSpy).toBeCalledWith(expect.stringMatching(/^up:/) && expect.stringMatching(/migration-name-test/))
    expect(consoleSpy).toBeCalledWith('All migrations finished successfully'.green)
  })

  it('should run down command', async () => {
    const consoleSpy = jest.spyOn(console, 'log')
    const opts = await exec('down', 'migration-name-test', '-d', uri)
    expect(opts?.configPath).toBe('migrate')
    expect(opts?.uri).toBe(uri)
    expect(opts?.collection).toBe('migrations')
    expect(opts?.autosync).toBe(false)
    expect(opts?.migrationsPath).toBe('./migrations')
    expect(consoleSpy).toBeCalledWith(expect.stringMatching(/^down:/) && expect.stringMatching(/migration-name-test/))
    expect(consoleSpy).toBeCalledWith('All migrations finished successfully'.green)
  })

  it('should throw "You need to provide the MongoDB Connection URI to persist migration status.\nUse option --uri / -d to provide the URI."', async () => {
    expect(exec('up', 'invalid-migration-name')).rejects.toThrowError('You need to provide the MongoDB Connection URI to persist migration status.\nUse option --uri / -d to provide the URI.')
  })

  it('should prune command', async () => {
    await exec('create', 'migration-name-prune', '-d', uri)
    await exec('up', 'migration-name-prune', '-d', uri, '-a', 'true')

    clearDirectory('migrations')

    const consoleSpy = jest.spyOn(console, 'log')
    const opts = await exec('prune', '-d', uri, '-a', 'true')
    expect(consoleSpy).toBeCalledWith(expect.stringMatching(/^Removing migration(s) from database/) && expect.stringMatching(/migration-name-test/))
    expect(opts?.configPath).toBe('migrate')
    expect(opts?.uri).toBe(uri)
    expect(opts?.collection).toBe('migrations')
    expect(opts?.autosync).toBe('true')
    expect(opts?.migrationsPath).toBe('./migrations')
  })

  it('should exit with code 1', async () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((number) => { throw new Error('process.exit: ' + number) })
    await expect(execExit('up')).rejects.toThrow()
    expect(mockExit).toHaveBeenCalledWith(1)
    mockExit.mockRestore()
  })

  it('should exit with code 0', async () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((number) => { throw new Error('process.exit: ' + number) })
    await expect(execExit('list', '-d', uri)).rejects.toThrow()
    expect(mockExit).toHaveBeenCalledWith(0)
    mockExit.mockRestore()
  })

  it('should log no pending migrations', async () => {
    await exec('create', 'test-migration', '-d', uri)
    await exec('up', '-d', uri)
    const consoleSpy = jest.spyOn(console, 'log')
    await exec('up', '-d', uri)
    await expect(consoleSpy).toBeCalledWith('There are no pending migrations'.yellow)
  })

  it('should throw "The up export is not defined in"', async () => {
    clearDirectory('migrations')
    await connection.collection('migrations').deleteMany({})
    fs.appendFileSync('migrations/template.ts', 'export function down () { /* do nothing */ }')
    await exec('create', 'test-migration', '-d', uri, '-t', 'migrations/template.ts')
    await expect(exec('up', '-d', uri)).rejects.toThrowError(/The 'up' export is not defined in/)
  })
})
