const A = 2
const K = 1
const Q = 0

class AI {
    requestAction(player, board) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (this._canBet(player, board) && player.card === A) {
                    return resolve({
                        type: 'BET',
                        value: board.lastBet + Math.min(board.ante * 6, board.maxBet - board.lastBet)
                    })
                }

                if (player.card === Q) {
                    if (player.bet < board.lastBet) {
                        return resolve({type: 'FOLD'})
                    } else {
                        return resolve({type: 'CALL'})
                    }
                }

                return resolve({type: 'CALL'})
            }, 1000)
        })
    }

    requestReBuy() {

    }

    update() {

    }

    _canBet(player, board) {
        return player.stack > 0 && board.maxBet > board.lastBet
    }

    _isLucked(pct = 1) {
        return Math.random() < pct
    }
}

class Player {
    constructor({name, borad, io, stack = 100}) {
        this.name = name
        this.stack = stack
        this.bet = 0
        this.board = board
        this.io = io
        this.card = -1
    }
}

class UserPlayer extends Player {
    async reBuy() {
        await this.io.requestReBuy()
        this.stack = 100
        this.io.update()
    }

    async getAction() {
        return this.io.requestAction()
    }
}

class AIPlayer extends Player {
    reBuy() {
        this.stack = 100
    }

    async getAction() {
        return this.io.requestAction(this, this.board)
    }
}

class Board {
    constructor({view, ante = 1} = {}) {
        this.view = view
        this.lastBet = 0
        this.players = []
        this.ante = ante
    }

    addPlayer(player) {
        this.players.push(player)
    }

    betRaise(player, size) {
        player.stack -= size - player.bet
        player.bet = size
        this.lastBet = size
    }

    async run() {
        while(true) {
            if (this.players.every(e => e.stack >= this.ante)) {
                let player = this.players.shift()
                this.players.push(player)

                this._dealtCards()
                this._betAnte()
                await this._toTrade()
                await this.view.showVillainCard()
                this._finishRound()
                this.view.update()
            } else {
                const player = this.players.find(e => e.stack < this.ante)
                await player.reBuy()
            }
        }
    }

    _dealtCards() {
        let cards = [0, 1, 2]

        this.players.forEach(e => {
            e.card = cards.splice(
                Math.floor(
                    cards.length * Math.random()
                ),
                1
            )[0]
        })
    }

    _betAnte() {
        this.players.forEach(e => {
            this.betRaise(e, this.ante)
        })
        this.view.update()
    }

    async _toTrade() {
        let isFirstTrade = true

        while(isFirstTrade || !this._isTradesFinished()) {
            for (let player of this.players) {
                const action = await player.getAction()

                switch(action.type) {
                    case 'BET':
                        this.betRaise(player, action.value)
                        this.view.update()
                        break
                    case 'CALL':
                        this.betRaise(player, Math.min(this.lastBet, player.stack + player.bet))
                        this.view.update()
                        if (isFirstTrade) {
                            break
                        } else {
                            return
                        }
                    case 'FOLD':
                        player.card = -1
                        return
                }
            }

            isFirstTrade = false
        }
    }

    _isTradesFinished() {
        return this.players.every(e => e.stack === 0 || e.bet === this.lastBet)
    }

    _finishRound() {
        let winner = this.players.reduce((res, e) => {
            return e.card > res.card ? e : res
        }, this.players[0])


        winner.stack += this.players.reduce((res, e) => {
            return res + Math.min(winner.bet, e.bet)
        }, 0)


        this.players.forEach(e => {
            e.bet = 0
            e.card = -1
        })
    }

    get minBet() {
        return this.lastBet + 1
    }
    
    get maxBet() {
        let minStackPlayer = this.players.reduce((res, e) => {
            return e.stack + e.bet < res.stack + res.bet ? e : res
        }, this.players[0])
        return minStackPlayer.stack + minStackPlayer.bet
    }
}

class UserInterface {
    constructor({villain, user, board}) {
        this.villain = villain
        this.user = user
        this.board = board

        this.cardsImgs = {
            2: 'a',
            1: 'k',
            0: 'q'
        }

        this.user.io = this
        this.board.view = this

        this.betSizeNumber = document.getElementById('bet-size-number')
        this.betSizeRange = document.getElementById('bet-size-range')
        this.foldButton = document.getElementById('fold-button')
        this.checkCallButton = document.getElementById('check-call-button')
        this.betRaiseButton = document.getElementById('bet-raise-button')
        this.villainBetRaiseChips = document.getElementById('villain-bet-raise-chips')
        this.userBetRaiseChips = document.getElementById('user-bet-raise-chips')
        this.villainStack = document.getElementById('villain-stack')
        this.userStack = document.getElementById('user-stack')
        this.rebuyButton = document.getElementById('rebuy-button')

        this.villainCardImg = document.getElementById('villain-card-img')
        this.userCardImg = document.getElementById('user-card-img')

        this.rebuyButton.style.visibility = 'hidden'

        this.villainStack.innerText = villain.stack
        this.userStack.innerText = user.stack

        this.betSizeNumber.oninput = () => {
            this.betSizeNumber.value = Math.max(this.betSizeNumber.value, board.minBet)
            this.betSizeNumber.value = Math.min(this.betSizeNumber.value, board.maxBet)

            this.betSizeRange.value = this.betSizeNumber.value
        }
        
        this.betSizeRange.oninput = () => {
            this.betSizeNumber.value = this.betSizeRange.value
        }

        this.user.getAction()
    }

    async requestReBuy() {
        this.rebuyButton.style.visibility = 'visible'
        this.userCardImg.src = `assets/back.jpg`
        
        return new Promise((resolve) => this.rebuyButton.onclick = () => {
            this.rebuyButton.style.visibility = 'hidden'
            resolve()
        })
    }

    async showVillainCard() {
        if (this.villain.card > -1) {
            return new Promise((resolve, reject) => {
                this.villainCardImg.src = `assets/${this.cardsImgs[this.villain.card]}.jpg`

                setTimeout(() => {
                    this.villainCardImg.src = `assets/back.jpg`
                    resolve()
                }, 1000)
            })
        }
    }

    async requestAction() {
        this._showControlls()
        
        return new Promise((resolve) => {
            this.betRaiseButton.onclick = () => {
                this._hideControlls()
                resolve({type: 'BET', value: Number(this.betSizeNumber.value)})
            }

            this.checkCallButton.onclick = () => {
                this._hideControlls()
                resolve({type: 'CALL'})
            }

            this.foldButton.onclick = () => {
                this._hideControlls()
                resolve({type: 'FOLD'})
            }
        })
    }

    update() {
        this._hideControlls()
        
        this.villainStack.innerText = this.villain.stack
        this.userStack.innerText = this.user.stack

        this.villainBetRaiseChips.innerText = this.villain.bet ? this.villain.bet : ' '
        this.userBetRaiseChips.innerText = this.user.bet ? this.user.bet : ' '

        this.betSizeRange.min = this.board.minBet
        this.betSizeRange.max = this.board.maxBet
        this.betSizeRange.value = this.board.minBet
        this.betSizeNumber.value = this.board.minBet

        this.villainStack.innerText = this.villain.stack
        this.userStack.innerText = this.user.stack

        this.userCardImg.src = `assets/${this.cardsImgs[this.user.card]}.jpg`
    }

    _hideControlls() {
        this.betSizeRange.style.visibility = 'hidden'
        this.betSizeNumber.style.visibility = 'hidden'

        this.foldButton.style.visibility = 'hidden'
        this.checkCallButton.style.visibility = 'hidden'
        this.betRaiseButton.style.visibility = 'hidden'
    }

    _showControlls() {
        if (this.user.stack > 0 && this.user.stack + this.user.bet > this.board.lastBet) {
            this.betSizeNumber.style.visibility = 'visible'
            this.betSizeRange.style.visibility = 'visible'
            this.betRaiseButton.style.visibility = 'visible'
        }

        if (this.user.bet >= this.board.lastBet) {
            this.checkCallButton.innerText = 'CHECK'
        } else {
            this.checkCallButton.innerText = 'CALL'
        }
        
        this.foldButton.style.visibility = 'visible'
        this.checkCallButton.style.visibility = 'visible'
    }
}

let board = new Board()
let villain = new AIPlayer({name: 'ai', board, io: new AI()})
let user = new UserPlayer({name: 'user', board})

board.addPlayer(villain)
board.addPlayer(user)

let ui = new UserInterface({villain, user, board})

board.run()