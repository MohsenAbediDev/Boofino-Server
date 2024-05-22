function setAi(getId)
{
    let id = 1
    if(getId.length != 0)
    {
        id = getId[0]._id +1
    }
    return id
}

module.exports = {setAi}