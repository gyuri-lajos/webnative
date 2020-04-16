import PublicTree from './public'
import PrivateTree from './private'
import { Tree, File, Links, FileSystemVersion, FileSystemConfig } from './types'
import { CID, FileContent } from '../ipfs'
import pathUtil from './path'
import link from './link'
import keystore from '../keystore'
import user from '../user'

export class FileSystem {

  root: PublicTree
  publicTree: PublicTree
  privateTree: PrivateTree
  private key: string

  constructor(root: PublicTree, publicTree: PublicTree, privateTree: PrivateTree, key: string) {
    this.root = root
    this.publicTree = publicTree
    this.privateTree = privateTree
    this.key = key
  }

  static async empty(cfg: FileSystemConfig = {}): Promise<FileSystem> {
    const { keyName = 'filesystem-root', version = FileSystemVersion.v0_0_0 } = cfg
    const root = await PublicTree.empty(version)
    const publicTreeInstance = await PublicTree.empty(version)
    const privateTreeInstance = await PrivateTree.empty(version)
    const key = await keystore.getKeyByName(keyName)
    return new FileSystem(root, publicTreeInstance, privateTreeInstance, key)
  }

  static async fromCID(cid: CID, cfg: FileSystemConfig = {}): Promise<FileSystem | null> {
    const { keyName = 'filesystem-root' } = cfg
    const root = await PublicTree.fromCID(cid)
    const publicTree = (await root.getDirectChild('public')) as PublicTree
    const privLink = root.findLink('private')
    const key = await keystore.getKeyByName(keyName)
    const privateTree = privLink ? await PrivateTree.fromCIDWithKey(privLink.cid, key) : null
    if(publicTree === null || privateTree === null) {
      return null
    }
    return new FileSystem(root, publicTree, privateTree, key)
  }

  static async forUser(username: string, cfg: FileSystemConfig = {}): Promise<FileSystem | null> {
    const cid = await user.fileRoot(username)
    return FileSystem.fromCID(cid, cfg)
  }

  // upgrade public IPFS folder to FileSystem
  static async upgradePublicCID(cid: CID, cfg: FileSystemConfig = {}): Promise<FileSystem> {
    const { keyName = 'filesystem-root', version = FileSystemVersion.v0_0_0 } = cfg
    const root = await PublicTree.empty(version)
    const pubTreeInstance = await PublicTree.fromCID(cid)
    const privTreeInstance = await PrivateTree.empty(version)
    const key = await keystore.getKeyByName(keyName)
    return new FileSystem(root, pubTreeInstance, privTreeInstance, key)
  }

  async ls(path: string): Promise<Links> {
    return this.runOnTree(path, false, (tree, relPath) => {
      return tree.ls(relPath)
    })
  }

  async mkdir(path: string): Promise<CID> {
    await this.runOnTree(path, true, (tree, relPath) => {
      return tree.mkdir(relPath)
    })
    return this.sync()
  }

  async add(path: string, content: FileContent): Promise<CID> {
    await this.runOnTree(path, true, (tree, relPath) => {
      return tree.add(relPath, content)
    })
    return this.sync()
  }

  async cat(path: string): Promise<FileContent | null> {
    return this.runOnTree(path, false, (tree, relPath) => {
      return tree.cat(relPath)
    })
  }

  async get(path: string): Promise<Tree | File | null> {
    return this.runOnTree(path, false, (tree, relPath) => {
      return tree.get(relPath)
    })
  }

  async pinList(): Promise<CID[]> {
    const rootCID = await this.sync()
    return this.privateTree.pinList().concat([ rootCID ])
  }

  async sync(): Promise<CID> {
    const pubCID = await this.publicTree.put()
    const privCID = await this.privateTree.putEncrypted(this.key)
    const pubLink = link.make('public', pubCID, false)
    const privLink = link.make('private', privCID, false)
    this.root = this.root
                  .updateLink(pubLink)
                  .updateLink(privLink)
    return this.root.put()
  }

  async runOnTree<a>(path: string, updateTree: boolean, fn: (tree: Tree, relPath: string) => Promise<a>): Promise<a> {
    const parts = pathUtil.split(path)
    const head = parts[0]
    const relPath = pathUtil.join(parts.slice(1))
    let result: a
    if(head === 'public') {
      result = await fn(this.publicTree, relPath)
      if(updateTree && PublicTree.instanceOf(result)){
        this.publicTree = result
      } 
    }else if(head === 'private') {
      result = await fn(this.privateTree, relPath)
      if(updateTree && PrivateTree.instanceOf(result)){
        this.privateTree = result
      }
      return result
    }else {
      throw new Error("Not a valid FileSystem path")
    }
    return result
  }
}

export default FileSystem
