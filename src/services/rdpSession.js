import { SESSION_TYPES, SessionInterface, registerSessionFactory } from "./session"

class RDPSession extends SessionInterface {
	cfg = null
	launched = false
	launchStatus = "idle"
	launcherPath = ""
	launchError = ""

	constructor(params) {
		super(params.name, SESSION_TYPES.RDP)
		this.cfg = params
	}
}

async function createRDPSession(params) {
	return new RDPSession(params)
}

registerSessionFactory(SESSION_TYPES.RDP, createRDPSession)