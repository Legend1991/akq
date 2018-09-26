const A = 2
const K = 1
const Q = 0

class AI {
    requestAction(player, board) {
        this._player = player;
        this._board = board;

        return new Promise((resolve, reject) => {
            setTimeout(() => {
                const betSize = Math.min(board.lastBet, board.maxBet - board.lastBet)
                const beted = Math.min(board.players[0].bet, board.players[1].bet)
                const s = betSize / (beted + beted)

                if (player.card === A) {
                    const betPctFunc = s => 1 / (1 + s)

                    if (player.bet < board.lastBet) {
                        return resolve({type: 'CALL'})
                    } else if (this._canBet(player, board) && this._isLucked(betPctFunc(s))) {
                        return resolve({
                            type: 'BET',
                            value: board.lastBet + betSize
                        })
                    } else {
                        return resolve({type: 'CALL'})
                    }
                }

                if (player.card === K) {
                    const betPctFunc = s => Math.max(1 / (1 + s) - 0.5, 0)
                    
                    if (player.bet < board.lastBet) {
                        const isLucked = this._isLucked(betPctFunc(s))
                        // console.log('K to call', beted, betSize, s, betPctFunc(s), isLucked)
                        if (isLucked) {
                            return resolve({type: 'CALL'})
                        } else {
                            return resolve({type: 'FOLD'})
                        }
                    } else {
                        // console.log('K check/bet')
                        return resolve(this._betOr(betPctFunc, 'CALL', player, board))
                    }
                }

                if (player.card === Q) {
                    if (player.bet < board.lastBet) {
                        return resolve({type: 'FOLD'})
                    } else {
                        // console.log('Q', Math.min(board.lastBet * 2, board.maxBet - board.lastBet))
                        return resolve(this._betOr(s => s / (1 + s), 'FOLD', player, board))
                    }
                }
            }, 1000)
        })
    }

    requestReBuy() {

    }

    update() {

    }

    _betOr(betPctFunc, altAction, player, board) {
        const betSize = Math.min(board.lastBet, board.maxBet - board.lastBet)
        const s = betSize / (board.lastBet + board.lastBet)
        const isLucked = this._isLucked(betPctFunc(s))

        // console.log('_betOr', board.lastBet, betSize, s, isLucked)

        if (isLucked && this._canBet(player, board)) {
            return {
                type: 'BET',
                value: board.lastBet + betSize
            }
        } else {
            return {type: altAction}
        }
    }

    _canBet(player, board) {
        return player.stack > 0 && board.maxBet > board.lastBet
    }

    // _isLucked(pct = 1) {
    //     console.log('_isLucked', pct)
    //     return Math.random() < pct
    // }

    _isLucked(pct = 1) {
        if (this._player.card > -1) {
            if (this._player.stats[this._player.card].bets / this._player.stats[this._player.card].count < pct) {
                return true
            }

            return false
        } else {
            return Math.random() < pct
        }
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
        this.stats = {
            '2': {
                count: 0,
                bets: 0,
            },
            '1': {
                count: 0,
                bets: 0,
            },
            '0': {
                count: 0,
                bets: 0
            },
            count: 0
        }
    }

    async reBuy() {
        await this.io.requestReBuy()
        this.stack = 100
    }

    async getAction() {
        let res = await this.io.requestAction(this, this.board)
        if (this.card > -1) {
            this.stats[this.card].count++;
            // if (this.card === 1) console.log(this.name, 'K', res.type, true);
            if ((res.type === 'BET' || res.type === 'CALL') 
                && !(res.type === 'CALL' && this.board.players[0].bet === 1 && this.board.players[1].bet === 1)) {
                this.stats[this.card].bets++;
            }
        }
        return res
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
            console.log('=========================== new run')
            if (this.players.every(e => e.stack >= this.ante)) {
                let player = this.players.shift()
                this.players.push(player)

                this._dealtCards()
                this._betAnte()
                await this._toTrade()
                await this.view.showVillainCard()
                this._finishRound()
            } else {
                const player = this.players.find(e => e.stack < this.ante)
                await player.reBuy()
            }

            this.view.update()
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

            if (e.stats) {
                console.log(`${e.name}\tA: ${e.stats[2].bets}/${e.stats[2].count} (${Math.round(e.stats[2].bets/e.stats[2].count * 100)}%)\tK: ${e.stats[1].bets}/${e.stats[1].count} (${Math.round(e.stats[1].bets/e.stats[1].count * 100)}%)\tQ: ${e.stats[0].bets}/${e.stats[0].count} (${Math.round(e.stats[0].bets/e.stats[0].count * 100)}%)\ttotal: ${e.stats.count}`);
                e.stats.count++;
            }
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
                        player.foldedCard = player.card
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

        const cards = {
            '2': 'A',
            '1': 'K',
            '0': 'Q'
        }

        console.log(this.players[1].name, this.players[1].card !== -1 ? cards[this.players[1].card] : cards[this.players[1].foldedCard], this.players[0].name, this.players[0].card !== -1 ? cards[this.players[0].card] : cards[this.players[0].foldedCard], winner.name === this.players[0].name ? -Math.min(this.players[0].bet, this.players[1].bet) : Math.min(this.players[0].bet, this.players[1].bet))

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
let villain = new Player({name: 'ai', board, io: new AI()})
let user = new Player({name: 'user', board})

board.addPlayer(villain)
board.addPlayer(user)

let ui = new UserInterface({villain, user, board})

board.run()