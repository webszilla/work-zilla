import random


def set_math_captcha(request):
    num_a = random.randint(1, 9)
    num_b = random.randint(1, 9)
    answer = num_a + num_b
    question = f"{num_a} + {num_b} = ?"
    request.session["captcha_answer"] = answer
    request.session["captcha_question"] = question
    request.session["enquiry_captcha_answer"] = answer
    request.session["enquiry_captcha_question"] = question
    return question
