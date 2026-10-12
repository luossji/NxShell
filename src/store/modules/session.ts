import { TreeNode } from 'element-ui/types/tree'
import { defineStore } from 'pinia'
import { getCurrentInstance, onMounted, reactive, ref } from 'vue'

export interface IMenuNode {
	id: number
	uuid: string
	text: string
	icon: string
	isFolder: boolean
	type: string
	protocol: string
	data: Record<string, any>
	children?: IMenuNode[]
}

interface IGroupProps {
	value: number
	label: string
}

export interface ITreeNode {
	sessionId: number | undefined
	protocol: string
	label: string
	isFolder: boolean
	node: TreeNode<string, IMenuNode> | undefined
	sessionData: Record<string, any> | undefined
	nodeElement: any
}

const useSessionStore = defineStore('session', () => {
		const group = ref<IGroupProps[]>([])
		const menuTree = ref<IMenuNode[]>([])
		// 菜单树重建计数，外部可据此在重建后重新应用搜索过滤
		const treeVersion = ref(0)
		const search = ref<boolean>(false)
		const currentNode = reactive<ITreeNode>({
			sessionId: undefined,
			protocol: '',
			label: '',
			isFolder: false,
			node: undefined,
			sessionData: undefined,
			nodeElement: undefined
		})

		const keyboardToAll = ref(false)

		const proxy = getCurrentInstance()?.proxy
		// @ts-ignore
		const sessionManager = proxy?.$sessionManager

		/**
		 * 匹配查找
		 *
		 * @param name 菜单名称
		 * @param keyword 关键词
		 * @returns 是否找到
		 */
		const matchFunction = (name: string, keyword?: string) => {
			if (keyword) {
				return new RegExp(keyword, 'i').test(name)
			}
			return true
		}

		/**
		 * 将sessionConfig转化为菜单结构
		 * 查找通用
		 *
		 * @param sessionConfigList 待转换的会话配置列表
		 * @param treeList 菜单树列表
		 * @param keyword 关键词
		 */
		function process(sessionConfigList: any[], treeList: any[], keyword?: string) {
			for (const cfgNode of sessionConfigList) {
				const { _id: id, name, type, config, uuid } = cfgNode
				let treeNode: IMenuNode = {
					id: id,
					uuid,
					icon: (cfgNode.config && cfgNode.config.system) || 'server',
					text: name,
					isFolder: cfgNode.type === 'folder',
					type: type,
					protocol: (config && config.protocal) ?? '',
					data: cfgNode.toJSONObject(false)
				}

				const children: IMenuNode[] = []
				if (treeNode.isFolder) {
					process(cfgNode.subSessions, children, keyword)
					treeNode.children = children
				}
				if (matchFunction(name, keyword) || children.length > 0) {
					treeList.push(treeNode)
				}
			}
		}

		/**
		 * 收集目录节点，生成「分组」下拉选项
		 *
		 * @param sessionConfigList 待遍历的会话配置列表
		 */
		function collectGroups(sessionConfigList: any[] = []) {
			for (const cfgNode of sessionConfigList) {
				if (cfgNode.type !== 'folder') {
					continue
				}
				// 保持原有顺序：先子级目录，再当前目录
				collectGroups(cfgNode.subSessions)
				group.value.push({ value: cfgNode._id, label: cfgNode.name })
			}
		}

		/**
		 * 仅刷新「分组」下拉选项，不重建菜单树
		 *
		 * 用于「查看会话属性 / 编辑会话」等只需分组数据的场景。
		 * 菜单树重建会让 el-tree 重新创建节点（节点 visible 恢复为 true），
		 * 导致左侧搜索框的过滤结果被清空并显示全部会话。
		 *
		 * @param sessionConfigList 会话配置列表，缺省时重新拉取
		 */
		function refreshGroups(sessionConfigList?: any[]) {
			group.value.splice(0)
			collectGroups(sessionConfigList ?? sessionManager.getSessionConfigs())
		}

		/**
		 * 更新菜单
		 *
		 * @param keyword 关键词
		 */
		function updateProcess(keyword?: string) {
			if (keyword) {
				search.value = true
				menuTree.value.splice(0, menuTree.value.length)
			}
			const sessionConfigs = sessionManager.getSessionConfigs()
			// 刷新分组下拉选项
			refreshGroups(sessionConfigs)
			// 清空数组
			menuTree.value.splice(0)
			process(sessionConfigs, menuTree.value, keyword)
			// 通知外部菜单树已重建（el-tree 会重建节点，过滤状态需重新应用）
			treeVersion.value++
		}

		/**
		 * 更新当前选中的节点
		 *
		 * @param nodeElement menu ref 对象
		 * @param node el-tree Node 节点数据
		 * @param nodeData 会话配置数据
		 */
		function updateCurrentNode(nodeElement: any, node?: TreeNode<string, IMenuNode>, nodeData?: IMenuNode) {
			currentNode.sessionId = nodeData?.id
			currentNode.protocol = nodeData?.protocol ?? ''
			currentNode.label = nodeData?.text ?? ''
			currentNode.nodeElement = nodeElement
			currentNode.node = node
			currentNode.sessionData = nodeData
			currentNode.isFolder = nodeData?.isFolder ?? false
		}

	/**
	 * 添加新的菜单选项
	 *
	 * @param sessionConfig 会话内容
	 */
	async function appendSessionConfig(sessionConfig: Record<string, any>) {
		const { isFolder, node, sessionData } = currentNode
		await sessionManager.addSessionConfig(isFolder ? sessionData?.data : null, sessionConfig)
		updateProcess()
	}

		function updateSendToAllXterm(status: boolean) {
			keyboardToAll.value = status
		}

		onMounted(updateProcess)

		return {
			group,
			menuTree,
			treeVersion,
			currentNode,
			keyboardToAll,
			updateSendToAllXterm,
			updateProcess,
			refreshGroups,
			appendSessionConfig,
			updateCurrentNode
		}
	}
)
export default useSessionStore
